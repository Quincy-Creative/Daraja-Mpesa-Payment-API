/**
 * Payment controller - backend wallet handling
 *
 * - Persists stk_payments, b2c_payouts and booking_transactions.
 * - Updates admin_wallets and host_wallets on STK success and B2C payout success.
 * - Commission (COMMISSION_RATE) is applied once when aggregated payments reach booking.total_amount.
 *
 * NOTE: This file uses Drizzle (CommonJS) via db (see db/client.js)
 */

const axios = require("axios");
const moment = require("moment");
const crypto = require("crypto");
const { db } = require("../db/client");
const { eq, sql } = require("drizzle-orm");
const path = require("path");

const {
	stk_payments,
	b2c_payouts,
	booking_transactions,
	bookings,
	profiles,
	admin_wallets,
	host_wallets,
} = require("../db/schema");

const { generateSecurityCredential } = require("../credentials/generateSecurityCredential");

const COMMISSION_RATE = 0.125; // 12.5%

// security credential caching
let securityCredential = null;
let securityCredentialPromise = null;
async function ensureSecurityCredential() {
	if (securityCredential) return securityCredential;
	if (securityCredentialPromise) return securityCredentialPromise;
	const initiatorPassword = process.env.INITIATOR_PASSWORD;
	const certPath = path.resolve("credentials/ProductionCertificate.cer");
	securityCredentialPromise = generateSecurityCredential(initiatorPassword, certPath)
		.then((cred) => {
			securityCredential = cred;
			return cred;
		})
		.catch((err) => {
			securityCredentialPromise = null;
			throw err;
		});
	return securityCredentialPromise;
}

// ---------------- helpers ----------------
function parseMpesaTimestamp(input) {
	if (!input) return new Date();
	const s = String(input);
	if (/^\d{14}$/.test(s)) {
		const year = s.slice(0, 4);
		const month = s.slice(4, 6);
		const day = s.slice(6, 8);
		const hour = s.slice(8, 10);
		const minute = s.slice(10, 12);
		const second = s.slice(12, 14);
		return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
	}
	if (/^\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(s)) {
		const [datePart, timePart] = s.split(" ");
		const [d, m, y] = datePart.split(".");
		return new Date(`${y}-${m}-${d}T${timePart}Z`);
	}
	return new Date(s);
}

function round2(n) {
	return Number(Number(n).toFixed(2));
}

function generateId() {
	return crypto.randomUUID();
}

const STK_RESULT_CODE_MAP = {
	0: { status: 200, message: "Success" },
	1037: { status: 400, message: "DS Timeout: User cannot be reached" },
	1032: { status: 400, message: "Request cancelled by user" },
	1: { status: 402, message: "Insufficient funds" },
	1025: { status: 500, message: "System error / message too long" },
	1019: { status: 410, message: "Transaction expired" },
	9999: { status: 500, message: "Unknown push error" },
	1001: { status: 429, message: "Subscriber busy or session conflict" },
};

// ---------------- controller functions ----------------

/**
 * sendStkPush - initiate STK push and insert an initial stk_payments row mapping
 */
const sendStkPush = async (req, res) => {
	try {
		const { phoneNumber, amount, guest_id, booking_id, host_id, booking_title, is_reservation = false } = req.body;

		if (!phoneNumber || !amount || !guest_id || !booking_id || !host_id || !booking_title) {
			return res.status(400).json({ error: "phoneNumber, amount, guest_id, booking_id, host_id and booking_title are required" });
		}

		const formattedPhone = phoneNumber.startsWith("0") ? `254${phoneNumber.slice(1)}` : phoneNumber;
		const timestamp = moment().format("YYYYMMDDHHmmss");
		const password = Buffer.from(`${process.env.SHORTCODE}${process.env.PASS_KEY}${timestamp}`).toString("base64");

		const requestBody = {
			BusinessShortCode: process.env.SHORTCODE,
			Password: password,
			Timestamp: timestamp,
			TransactionType: "CustomerPayBillOnline",
			Amount: amount,
			PartyA: formattedPhone,
			PartyB: process.env.SHORTCODE,
			PhoneNumber: formattedPhone,
			CallBackURL: process.env.CALLBACK_URL,
			AccountReference: `Booking Ref:${booking_title}`,
			TransactionDesc: `Payment for mystay booking ${booking_title}`,
		};

		const response = await axios.post(`${process.env.BASE_URL}/mpesa/stkpush/v1/processrequest`, requestBody, {
			headers: { Authorization: `Bearer ${req.darajaToken}` },
			timeout: 20000,
		});

		const data = response.data || {};
		const merchantRequestId = data.MerchantRequestID || data.merchantRequestId || null;
		const checkoutRequestId = data.CheckoutRequestID || data.checkoutRequestId || null;

		// Insert initial mapping into stk_payments
		try {
			await db.insert(stk_payments).values({
				guest_id,
				booking_id,
				host_id,
				is_reservation,
				amount,
				phone_number: formattedPhone,
				mpesa_receipt: null,
				merchant_request_id: merchantRequestId,
				checkout_request_id: checkoutRequestId,
				transaction_date: null,
				result_code: null,
				result_desc: null,
				created_at: new Date(),
				updated_at: new Date(),
			});
		} catch (err) {
			console.error("Failed to insert initial stk_payments mapping:", err?.message || err);
		}

		return res.status(200).json({ status: "success", message: "STK push initiated", data });
	} catch (err) {
		console.error("sendStkPush error:", err?.response?.data || err.message || err);
		return res.status(500).json({ error: "Failed to initiate STK push", details: err?.response?.data || err.message });
	}
};

/**
 * handleCallback - STK callback handler
 *
 * - updates/creates stk_payments
 * - credits admin_wallets and host_wallets for each payment
 * - upserts booking_transactions and applies commission once when booking total met
 */
const handleCallback = async (req, res) => {
	try {
		const callbackData = req.body;
		console.log("STK Callback received:", JSON.stringify(callbackData, null, 2));

		const Body = callbackData?.Body;
		const stkCallback = Body?.stkCallback;
		if (!stkCallback) {
			return res.status(400).json({ error: "Invalid callback payload" });
		}

		const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

		// parse metadata
		let amount = 0;
		let mpesaReceipt = null;
		let transactionDateRaw = null;
		let phoneNumber = null;

		if (CallbackMetadata && Array.isArray(CallbackMetadata.Item)) {
			const items = CallbackMetadata.Item;
			amount = Number(items.find((i) => i.Name === "Amount")?.Value ?? 0);
			mpesaReceipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value ?? null;
			transactionDateRaw = items.find((i) => i.Name === "TransactionDate")?.Value ?? null;
			phoneNumber = String(items.find((i) => i.Name === "PhoneNumber")?.Value ?? "");
		}

		const txDate = transactionDateRaw ? parseMpesaTimestamp(transactionDateRaw) : new Date();

		// find existing stk_payments by checkoutRequestId or merchantRequestId
		let existingRows = [];
		try {
			existingRows = await db.select().from(stk_payments).where(eq(stk_payments.checkout_request_id, CheckoutRequestID)).limit(1);
		} catch (e) {
			console.error("Error querying stk_payments by checkout_request_id:", e?.message || e);
			existingRows = [];
		}
		if (!existingRows || existingRows.length === 0) {
			try {
				existingRows = await db.select().from(stk_payments).where(eq(stk_payments.merchant_request_id, MerchantRequestID)).limit(1);
			} catch (e) {
				console.error("Error querying stk_payments by merchant_request_id:", e?.message || e);
				existingRows = [];
			}
		}

		let paymentRow = existingRows && existingRows.length ? existingRows[0] : null;

		// idempotency: if mpesaReceipt exists anywhere, skip processing
		if (mpesaReceipt) {
			try {
				const dup = await db.select().from(stk_payments).where(eq(stk_payments.mpesa_receipt, mpesaReceipt)).limit(1);
				if (dup && dup.length) {
					console.log("Duplicate callback detected for mpesaReceipt:", mpesaReceipt);
					const mapped = STK_RESULT_CODE_MAP[ResultCode] || { status: 200, message: ResultDesc || "Duplicate" };
					return res.status(200).json({ success: ResultCode === 0, code: ResultCode, message: ResultDesc, mappedMessage: mapped.message });
				}
			} catch (err) {
				console.error("Error checking duplicate mpesaReceipt:", err?.message || err);
			}
		}

		// If paymentRow exists -> update & handle booking_transactions + wallets in transaction
		if (paymentRow) {
			try {
				await db.transaction(async (tx) => {
					// 1) update stk_payments row
					const pk = Number(paymentRow.id);
					if (!pk || Number.isNaN(pk)) throw new Error(`Invalid paymentRow.id: ${String(paymentRow.id)}`);

					await tx.update(stk_payments).set({
						mpesa_receipt: mpesaReceipt ?? null,
						transaction_date: txDate,
						result_code: ResultCode ?? null,
						result_desc: ResultDesc ?? null,
						updated_at: new Date(),
					}).where(eq(stk_payments.id, pk));

					// always credit admin & host wallets for successful or failed? Only credit on success.
					if (ResultCode === 0 && paymentRow.booking_id) {
						const bookingId = paymentRow.booking_id;
						const hostId = paymentRow.host_id || null;

						// fetch booking to get total_amount
						const bookingRows = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
						const booking = bookingRows && bookingRows.length ? bookingRows[0] : null;
						const bookingTotal = booking ? Number(booking.total_amount || 0) : null;

						// upsert or update booking_transactions
						const btRows = await tx.select().from(booking_transactions).where(eq(booking_transactions.booking_id, bookingId)).limit(1);
						const txIdsArray = mpesaReceipt ? [mpesaReceipt] : [];

						// admin host wallets require ADMIN_ID
						const ADMIN_ID = process.env.ADMIN_ID_UUID;
						if (!ADMIN_ID) throw new Error("ADMIN_ID_UUID environment variable not set");

						if (btRows && btRows.length) {
							// existing booking_transactions: append amount
							const existingBT = btRows[0];
							const existingTotal = Number(existingBT.total_amount || 0);
							const newTotal = round2(existingTotal + amount);

							await tx.update(booking_transactions).set({
								total_amount: sql`booking_transactions.total_amount + ${amount}`,
								transaction_ids: sql`booking_transactions.transaction_ids || ${JSON.stringify(txIdsArray)}::jsonb`,
								updated_at: new Date(),
							}).where(eq(booking_transactions.booking_id, bookingId));

							// wallet updates for this incoming payment: admin receives amount and marks payable; host gets remaining_balance increased by amount
							// ADMIN upsert: balance += amount, payable_balance += amount
							await tx.execute(
								`INSERT INTO public.admin_wallets (admin_id, balance, total_commission, payable_balance, created_at, updated_at)
									VALUES ($1, $2, 0, $3, now(), now())
									ON CONFLICT (admin_id) DO UPDATE
									SET balance = admin_wallets.balance + $2,
										payable_balance = admin_wallets.payable_balance + $3,
										updated_at = now()`,
								[ADMIN_ID, amount, amount]
							);

							// host_wallets upsert: remaining_balance += amount
							await tx.execute(
								`INSERT INTO public.host_wallets (host_id, remaining_balance, withdrawn, created_at, updated_at)
									VALUES ($1, $2, 0, now(), now())
									ON CONFLICT (host_id) DO UPDATE
									SET remaining_balance = host_wallets.remaining_balance + $2,
										updated_at = now()`,
								[hostId, amount]
							);

							// If commission not yet applied AND bookingTotal available AND newTotal >= bookingTotal -> apply commission
							const commissionNotApplied = !existingBT.commission_applied;
							if (commissionNotApplied && bookingTotal !== null && newTotal >= Number(bookingTotal)) {
								const commission = round2(newTotal * COMMISSION_RATE);
								// set commission_amount and commission_applied on booking_transactions
								await tx.update(booking_transactions).set({
									commission_amount: commission,
									commission_applied: true,
									updated_at: new Date(),
								}).where(eq(booking_transactions.booking_id, bookingId));

								// admin_wallets: total_commission += commission, payable_balance -= commission
								await tx.execute(
									`UPDATE public.admin_wallets
										SET total_commission = total_commission + $1,
											payable_balance = GREATEST(payable_balance - $1, 0),
											updated_at = now()
										WHERE admin_id = $2`,
									[commission, ADMIN_ID]
								);

								// host_wallets: deduct commission from remaining_balance
								await tx.execute(
									`UPDATE public.host_wallets
										SET remaining_balance = GREATEST(remaining_balance - $1, 0),
											updated_at = now()
										WHERE host_id = $2`,
									[commission, hostId]
								);
							}
						} else {
							// no booking_transactions row yet: insert
							// decide if commission should be applied immediately (single full payment)
							const commissionApplied = (bookingTotal !== null && round2(amount) >= Number(bookingTotal));
							const commissionAmount = commissionApplied ? round2(amount * COMMISSION_RATE) : 0;

							const newBT = {
								id: generateId(),
								booking_id: bookingId,
								host_id: hostId,
								reservation_amount: paymentRow.is_reservation ? amount : 0,
								total_amount: amount,
								commission_amount: commissionAmount,
								commission_applied: commissionApplied,
								transaction_ids: txIdsArray,
								created_at: new Date(),
								updated_at: new Date(),
							};
							await tx.insert(booking_transactions).values(newBT);

							// wallet updates for this incoming payment:
							const ADMIN_ID2 = process.env.ADMIN_ID_UUID;
							if (!ADMIN_ID2) throw new Error("ADMIN_ID_UUID environment variable not set");

							// admin_wallet upsert: add full amount to balance and payable_balance
							await tx.execute(
								`INSERT INTO public.admin_wallets (admin_id, balance, total_commission, payable_balance, created_at, updated_at)
									VALUES ($1, $2, 0, $3, now(), now())
									ON CONFLICT (admin_id) DO UPDATE
									SET balance = admin_wallets.balance + $2,
										payable_balance = admin_wallets.payable_balance + $3,
										updated_at = now()`,
								[ADMIN_ID2, amount, amount]
							);

							// host_wallet upsert: remaining_balance += amount
							await tx.execute(
								`INSERT INTO public.host_wallets (host_id, remaining_balance, withdrawn, created_at, updated_at)
									VALUES ($1, $2, 0, now(), now())
									ON CONFLICT (host_id) DO UPDATE
									SET remaining_balance = host_wallets.remaining_balance + $2,
										updated_at = now()`,
								[hostId, amount]
							);

							// if commissionApplied true (full payment done), immediately account for commission
							if (commissionApplied && commissionAmount > 0) {
								// admin total_commission += commission, payable_balance -= commission
								await tx.execute(
									`UPDATE public.admin_wallets
										SET total_commission = total_commission + $1,
											payable_balance = GREATEST(payable_balance - $1, 0),
											updated_at = now()
										WHERE admin_id = $2`,
									[commissionAmount, ADMIN_ID2]
								);

								// host_wallets: deduct commission from remaining_balance
								await tx.execute(
									`UPDATE public.host_wallets
										SET remaining_balance = GREATEST(remaining_balance - $1, 0),
											updated_at = now()
										WHERE host_id = $2`,
									[commissionAmount, hostId]
								);
							}
						}

						// Update bookings table's payment_status and is_reservation fields accordingly
						if (paymentRow.is_reservation) {
							await tx.execute(
								`UPDATE public.bookings
									SET payment_status = 'partial',
										transaction_id = $1,
										is_reservation = true,
										updated_at = now()
									WHERE id = $2`,
								[mpesaReceipt, bookingId]
							);
						} else {
							await tx.execute(
								`UPDATE public.bookings
									SET payment_status = 'paid',
										transaction_id = $1,
										is_reservation = false,
										updated_at = now()
									WHERE id = $2`,
								[mpesaReceipt, bookingId]
							);
						}
					} // end ResultCode === 0 and booking_id
				}); // end transaction
			} catch (err) {
				console.error("Transaction error updating stk_payments / booking_transactions / wallets:", err?.message || err);
				const mapped = STK_RESULT_CODE_MAP[ResultCode] || { status: 200, message: ResultDesc || "Unknown" };
				return res.status(200).json({
					success: ResultCode === 0,
					code: ResultCode,
					message: ResultDesc,
					mappedMessage: mapped.message,
					error: String(err?.message || err),
				});
			}
		} else {
			// no mapping: insert an audit-only stk_payments row (we do not attempt wallet changes)
			try {
				await db.insert(stk_payments).values({
					guest_id: null,
					booking_id: null,
					host_id: null,
					is_reservation: false,
					amount,
					phone_number: phoneNumber ? String(phoneNumber) : null,
					mpesa_receipt: mpesaReceipt,
					merchant_request_id: MerchantRequestID,
					checkout_request_id: CheckoutRequestID,
					transaction_date: txDate,
					result_code: ResultCode,
					result_desc: ResultDesc,
					created_at: new Date(),
					updated_at: new Date(),
				});
			} catch (err) {
				console.error("Failed to insert audit stk_payments row:", err?.message || err);
			}
			console.warn("No stk_payments mapping found for CheckoutRequestID or MerchantRequestID", CheckoutRequestID, MerchantRequestID);
		}

		// Final response ack to Daraja (they expect 200)
		const mapped = STK_RESULT_CODE_MAP[ResultCode] || { status: 200, message: ResultDesc || "Unknown" };
		return res.status(200).json({
			success: ResultCode === 0,
			code: ResultCode,
			message: ResultDesc,
			mappedMessage: mapped.message,
		});
	} catch (err) {
		console.error("handleCallback unexpected error:", err?.message || err);
		// Always ack with 200 to avoid retries; include details in body
		return res.status(200).json({
			success: false,
			code: -1,
			message: "Internal server error while processing callback",
			details: err?.message || String(err),
		});
	}
};

/**
 * stkQuery - query STK status
 */
const stkQuery = async (req, res) => {
	try {
		const { checkoutRequestId } = req.body;
		if (!checkoutRequestId) return res.status(400).json({ error: "checkoutRequestId is required" });

		const timestamp = moment().format("YYYYMMDDHHmmss");
		const password = Buffer.from(`${process.env.SHORTCODE}${process.env.PASS_KEY}${timestamp}`).toString("base64");

		const requestBody = {
			BusinessShortCode: process.env.SHORTCODE,
			Password: password,
			Timestamp: timestamp,
			CheckoutRequestID: checkoutRequestId,
		};

		const response = await axios.post(`${process.env.BASE_URL}/mpesa/stkpushquery/v1/query`, requestBody, {
			headers: { Authorization: `Bearer ${req.darajaToken}` },
		});

		return res.status(200).json({ status: "success", data: response.data });
	} catch (err) {
		console.error("stkQuery error:", err?.response?.data || err.message || err);
		return res.status(500).json({ error: "Failed to query STK", details: err?.response?.data || err.message });
	}
};

/**
 * b2cPayment - initiate B2C and persist minimal b2c_payouts row only if initiation accepted
 */
const b2cPayment = async (req, res) => {
	try {
		const { phoneNumber, amount, host_id, remarks } = req.body;
		if (!phoneNumber || !amount || !host_id) {
			return res.status(400).json({ success: false, error: "phoneNumber, amount, host_id required" });
		}
		const formattedPhone = phoneNumber.startsWith("0") ? `254${phoneNumber.slice(1)}` : phoneNumber;

		let securityCred;
		try {
			securityCred = await ensureSecurityCredential();
		} catch (err) {
			console.error("Security credential generation failed:", err?.message || err);
			return res.status(500).json({ success: false, error: "Failed to generate security credential" });
		}

		const localRequestId = generateId();

		const requestBody = {
			InitiatorName: process.env.INITIATOR_NAME,
			SecurityCredential: securityCred,
			CommandID: "BusinessPayment",
			Amount: amount,
			PartyA: process.env.SHORTCODE,
			PartyB: formattedPhone,
			Remarks: remarks || `Payout for host ${host_id}`,
			QueueTimeOutURL: process.env.B2C_QUEUE_TIMEOUT_URL,
			ResultURL: process.env.B2C_RESULT_URL,
			Occasion: `Payout-${localRequestId}`,
		};

		const response = await axios.post(`${process.env.BASE_URL}/mpesa/b2c/v1/paymentrequest`, requestBody, {
			headers: { Authorization: `Bearer ${req.darajaToken}` },
			timeout: 20000,
		});

		const remote = response.data || {};
		const responseCode = String(remote.ResponseCode ?? remote.responseCode ?? "");
		const responseDesc = remote.ResponseDescription ?? remote.ResponseDesc ?? "";

		if (responseCode !== "0") {
			return res.status(400).json({
				success: false,
				code: responseCode,
				message: responseDesc || "B2C initiation failed",
				daraja: remote,
			});
		}

		// persist minimal b2c_payouts
		const originator = remote.OriginatorConversationID ?? remote.originatorConversationID ?? null;
		const conversation = remote.ConversationID ?? remote.conversationID ?? null;

		let insertedRow = null;
		try {
			await db.insert(b2c_payouts).values({
				host_id,
				receiverPhoneNumber: formattedPhone,
				originator_conversation_id: originator,
				conversation_id: conversation,
				transaction_id: null,
				transaction_receipt: null,
				amount,
				receiver_name: null,
				completed_at: null,
				b2c_recipient_is_registered: null,
				b2c_charges_paid_funds: null,
				result_code: null,
				result_desc: null,
				created_at: new Date(),
			});

			const rows = await db.select().from(b2c_payouts).where(eq(b2c_payouts.originator_conversation_id, originator)).limit(1);
			if (rows && rows.length) insertedRow = rows[0];
		} catch (err) {
			console.error("Failed to insert b2c_payouts after successful initiation:", err?.message || err);
			return res.status(200).json({
				success: true,
				initiated: true,
				persisted: false,
				daraja: remote,
				error: "Failed to persist b2c_payouts row (check server logs).",
			});
		}

		return res.status(200).json({
			success: true,
			initiated: true,
			persisted: !!insertedRow,
			payoutId: insertedRow?.id ?? null,
			daraja: remote,
		});
	} catch (err) {
		console.error("b2cPayment error:", err?.response?.data || err.message || err);
		return res.status(500).json({ success: false, error: err?.response?.data || err.message || String(err) });
	}
};

/**
 * b2cResult - handle B2C result callback
 * - updates b2c_payouts
 * - on success: reduce admin_wallets.balance & payable_balance, reduce host_wallet.remaining_balance, increase host_wallet.withdrawn
 */
const b2cResult = async (req, res) => {
	try {
		const received = req.body;
		console.log("B2C Result received:", JSON.stringify(received, null, 2));

		const result = received?.Result || received?.data?.Result || received;
		if (!result || typeof result !== "object") {
			console.warn("Invalid B2C result payload:", received);
			return res.status(200).json({ success: false, message: "Invalid B2C result payload" });
		}

		const { OriginatorConversationID, ConversationID, TransactionID, ResultParameters } = result;
		const paramsArray = ResultParameters?.ResultParameter || [];
		const params = {};
		for (const p of paramsArray) params[p.Key] = p.Value;

		const resultCode = Number(result.ResultCode ?? params.ResultCode ?? 0);
		const resultDesc = result.ResultDesc ?? params.ResultDesc ?? "";

		const amount = Number(params.TransactionAmount ?? params.Amount ?? 0);
		const transactionReceipt = params.TransactionReceipt ?? params.ReceiptNo ?? TransactionID ?? null;
		const receiverName = params.ReceiverPartyPublicName ?? params.CreditPartyName ?? "";
		const completedAtRaw = params.TransactionCompletedDateTime ?? params.FinalisedTime ?? params.InitiatedTime ?? null;
		const completedAt = completedAtRaw ? parseMpesaTimestamp(completedAtRaw) : new Date();

		const recipientRegistered = String(params.B2CRecipientIsRegisteredCustomer ?? "").toUpperCase() === "Y";
		const chargesPaidFunds = Number(params.B2CChargesPaidAccountAvailableFunds ?? 0);

		// find the b2c_payouts row inserted earlier (by originator/conversation/phone+amount fallback)
		let payoutRow = null;
		try {
			if (OriginatorConversationID) {
				const rows = await db.select().from(b2c_payouts).where(eq(b2c_payouts.originator_conversation_id, OriginatorConversationID)).limit(1);
				if (rows && rows.length) payoutRow = rows[0];
			}
			if (!payoutRow && ConversationID) {
				const rows2 = await db.select().from(b2c_payouts).where(eq(b2c_payouts.conversation_id, ConversationID)).limit(1);
				if (rows2 && rows2.length) payoutRow = rows2[0];
			}

			if (!payoutRow && receiverName) {
				const phoneToken = String(receiverName).split(/\s|-/)[0] || null;
				const cleanPhone = phoneToken ? phoneToken.replace(/\D/g, "") : null;
				if (cleanPhone) {
					const rows3 = await db
						.select()
						.from(b2c_payouts)
						.where(eq(b2c_payouts.receiverPhoneNumber, cleanPhone))
						.where(eq(b2c_payouts.amount, amount))
						.where(eq(b2c_payouts.result_code, null))
						.orderBy(sql`created_at DESC`)
						.limit(1);
					if (rows3 && rows3.length) payoutRow = rows3[0];
				}
			}
		} catch (err) {
			console.error("Error finding b2c_payouts row in callback:", err?.message || err);
		}

		if (!payoutRow) {
			console.warn("No matching b2c_payouts row found for callback. Originator/Conversation/Receiver/Amount:", {
				OriginatorConversationID,
				ConversationID,
				receiverName,
				amount,
			});
			return res.status(200).json({
				success: resultCode === 0,
				code: resultCode,
				message: resultDesc,
				persisted: false,
				note: "No matching b2c_payouts row found to update. Check initiation step.",
			});
		}

		// idempotency: check transaction id already exist
		try {
			if (TransactionID) {
				const existing = await db.select().from(b2c_payouts).where(eq(b2c_payouts.transaction_id, TransactionID)).limit(1);
				if (existing && existing.length) {
					console.log("Duplicate B2C result already processed:", TransactionID);
					return res.status(200).json({ success: true, code: resultCode, message: "Already processed", persisted: true });
				}
			}
		} catch (err) {
			console.error("Error checking existing transaction id in b2c_payouts:", err?.message || err);
		}

		// If success: update payout row and update admin & host wallets accordingly (debit admin -> payout to host)
		if (resultCode === 0) {
			try {
				await db.transaction(async (tx) => {
					await tx.update(b2c_payouts).set({
						transaction_id: TransactionID ?? payoutRow.transaction_id,
						transaction_receipt: transactionReceipt ?? payoutRow.transaction_receipt,
						receiver_name: receiverName ?? payoutRow.receiver_name,
						completed_at: completedAt ?? payoutRow.completed_at,
						b2c_recipient_is_registered: recipientRegistered,
						b2c_charges_paid_funds: chargesPaidFunds,
						result_code: resultCode,
						result_desc: resultDesc,
						updated_at: new Date(),
					}).where(eq(b2c_payouts.id, payoutRow.id));

					// update admin_wallets and host_wallets
					const ADMIN_ID = process.env.ADMIN_ID_UUID;
					if (!ADMIN_ID) throw new Error("ADMIN_ID_UUID environment variable not set");

					// admin wallets: balance -= amount, payable_balance -= amount
					await tx.execute(
						`UPDATE public.admin_wallets
							SET balance = GREATEST(balance - $1, 0),
								payable_balance = GREATEST(payable_balance - $1, 0),
								updated_at = now()
							WHERE admin_id = $2`,
						[amount, ADMIN_ID]
					);

					// host wallets: remaining_balance = GREATEST(remaining_balance - amount, 0), withdrawn += amount
					await tx.execute(
						`INSERT INTO public.host_wallets (host_id, remaining_balance, withdrawn, created_at, updated_at)
							VALUES ($1, 0, $2, now(), now())
							ON CONFLICT (host_id) DO UPDATE
							SET remaining_balance = GREATEST(host_wallets.remaining_balance - $2, 0),
								withdrawn = host_wallets.withdrawn + $2,
								updated_at = now()`,
						[payoutRow.host_id, amount]
					);
				}); // end transaction
			} catch (err) {
				console.error("b2cResult transaction error:", err?.message || err);
				return res.status(200).json({ success: false, code: resultCode, message: resultDesc, persisted: false, error: String(err?.message || err) });
			}

			return res.status(200).json({ success: true, code: resultCode, message: resultDesc, persisted: true, payoutId: payoutRow.id });
		} else {
			// failed result -> update result_code/result_desc for auditing
			try {
				await db.update(b2c_payouts).set({
					result_code: resultCode,
					result_desc: resultDesc,
					updated_at: new Date(),
				}).where(eq(b2c_payouts.id, payoutRow.id));
			} catch (err) {
				console.error("Failed to update b2c_payouts with failure result:", err?.message || err);
			}
			return res.status(200).json({ success: false, code: resultCode, message: resultDesc, persisted: true, payoutId: payoutRow.id });
		}
	} catch (err) {
		console.error("b2cResult unexpected error:", err?.message || err);
		return res.status(200).json({ success: false, message: "B2C result received but server error processing it. Check logs." });
	}
};

// Exports
module.exports = {
	sendStkPush,
	handleCallback,
	stkQuery,
	b2cPayment,
	b2cResult,
	// other helpers (keep default simple ack endpoints)
	b2cQueueTimeout: (req, res) => {
		console.log("B2C Queue Timeout", req.body);
		return res.status(200).json({ message: "ok" });
	},
	b2cAccountBalance: async (req, res) => {
		try {
			let securityCred;
			try {
				securityCred = await ensureSecurityCredential();
			} catch (err) {
				console.error("Security credential error:", err?.message || err);
				return res.status(500).json({ error: "Failed to generate security credential" });
			}

			const requestBody = {
				Initiator: process.env.INITIATOR_NAME,
				SecurityCredential: securityCred,
				CommandID: "AccountBalance",
				PartyA: process.env.SHORTCODE,
				IdentifierType: "4",
				Remarks: "Account Balance Request",
				QueueTimeOutURL: process.env.B2C_ACCOUNT_BALANCE_QUEUE_URL,
				ResultURL: process.env.B2C_ACCOUNT_BALANCE_RESULTS_URL,
			};

			const response = await axios.post(`${process.env.BASE_URL}/mpesa/accountbalance/v1/query`, requestBody, {
				headers: { Authorization: `Bearer ${req.darajaToken}` },
			});

			return res.status(200).json({ status: "success", data: response.data });
		} catch (err) {
			console.error("b2cAccountBalance error:", err?.response?.data || err.message || err);
			return res.status(500).json({ error: "Failed to request account balance", details: err?.response?.data || err.message });
		}
	},
	accountBalanceResult: async (req, res) => {
		try {
			const received = req.body;
			console.log("Account Balance Result received:", JSON.stringify(received, null, 2));
			const Result = received?.Result || received?.data?.Result || null;
			if (!Result) {
				console.warn("Invalid account balance result payload");
				return res.status(400).json({ error: "Invalid payload" });
			}
			const paramsArr = Result.ResultParameters?.ResultParameter || [];
			for (const p of paramsArr) {
				if (p.Key === "AccountBalance") {
					const parsed = parseAccountBalanceString(p.Value);
					return res.status(200).json({ status: "success", accounts: parsed });
				}
			}
			return res.status(200).json({ status: "success", data: received });
		} catch (err) {
			console.error("accountBalanceResult error:", err?.message || err);
			return res.status(500).json({ error: "Error processing account balance result", details: err?.message || String(err) });
		}
	},
	accountBalanceQueueTimeout: (req, res) => {
		console.log("Account Balance Queue Timeout received:", JSON.stringify(req.body, null, 2));
		return res.status(200).json({ message: "Account balance queue timeout acknowledged" });
	},
	checkB2CTransactionStatus: async (req, res) => {
		try {
			const { transactionId, originatorConversationID } = req.body;
			if (!transactionId || !originatorConversationID) return res.status(400).json({ error: "transactionId and originatorConversationID required" });

			const securityCred = await ensureSecurityCredential();

			const requestBody = {
				Initiator: process.env.INITIATOR_NAME,
				SecurityCredential: securityCred,
				CommandID: "TransactionStatusQuery",
				TransactionID: transactionId,
				OriginatorConversationID: originatorConversationID,
				PartyA: process.env.SHORTCODE,
				IdentifierType: "4",
				Remarks: "Check transaction status",
				Occasion: "Check",
				QueueTimeOutURL: process.env.B2C_CHECK_TRANSACTION_QUEUE_URL,
				ResultURL: process.env.B2C_CHECK_TRANSACTION_RESULTS_URL,
			};

			const response = await axios.post(`${process.env.BASE_URL}/mpesa/transactionstatus/v1/query`, requestBody, {
				headers: { Authorization: `Bearer ${req.darajaToken}` },
			});

			return res.status(200).json({ status: "success", data: response.data });
		} catch (err) {
			console.error("checkB2CTransactionStatus error:", err?.response?.data || err.message || err);
			return res.status(500).json({ error: "Failed to check transaction status", details: err?.response?.data || err.message });
		}
	},
	b2cCheckTransactionQueueTimeout: (req, res) => {
		console.log("B2C Check Transaction Queue Timeout", JSON.stringify(req.body, null, 2));
		return res.status(200).json({ message: "B2C check queue timeout acknowledged" });
	},
	b2cCheckTransactionResult: (req, res) => {
		console.log("B2C Check Transaction Result", JSON.stringify(req.body, null, 2));
		return res.status(200).json({ message: "B2C check transaction result processed", data: req.body });
	},
};

// utility for accountBalance parsing
function parseAccountBalanceString(s) {
	const result = {};
	if (!s || typeof s !== "string") return result;
	const parts = s.split("&");
	for (const p of parts) {
		const fields = p.split("|");
		const name = fields[0]?.trim();
		const amount = parseFloat(fields[2]) || 0;
		if (name) result[name] = amount;
	}
	return result;
}
