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
	mpesa_refunds,
	booking_transactions,
	bookings,
	profiles,
	admin_wallets,
	host_wallets,
} = require("../db/schema");

const { generateSecurityCredential } = require("../credentials/generateSecurityCredential");

const COMMISSION_RATE = 0.125; // 12.5%

// security credential caching (used by B2C flows)
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

// helpers
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

// --------------------------------------------------
// sendStkPush - initiate and insert mapping
// --------------------------------------------------
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

		// insert initial mapping; this is safe and useful for callback reconciliation
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
			// do not fail STK push because Daraja expects 200; log and continue
		}

		return res.status(200).json({ status: "success", message: "STK push initiated", data });
	} catch (err) {
		console.error("sendStkPush error:", err?.response?.data || err.message || err);
		return res.status(500).json({ error: "Failed to initiate STK push", details: err?.response?.data || err.message });
	}
};

// --------------------------------------------------
// handleCallback - handle STK result (main flow)
// --------------------------------------------------
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

		// find existing stk_payments mapping
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

		// idempotency: if mpesaReceipt already exists in DB skip processing
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

		// If mapping exists, update it and perform booking_transactions + wallet updates in a transaction
		if (paymentRow) {
			try {
				await db.transaction(async (tx) => {
					// update stk_payments row (Drizzle)
					const pk = Number(paymentRow.id);
					if (!pk || Number.isNaN(pk)) throw new Error(`Invalid paymentRow.id: ${String(paymentRow.id)}`);

					await tx.update(stk_payments).set({
						mpesa_receipt: mpesaReceipt ?? null,
						transaction_date: txDate,
						result_code: ResultCode ?? null,
						result_desc: ResultDesc ?? null,
						updated_at: new Date(),
					}).where(eq(stk_payments.id, pk));

					// Only process booking_transactions & wallets on success
					if (ResultCode === 0 && paymentRow.booking_id) {
						const bookingId = paymentRow.booking_id;
						const hostId = paymentRow.host_id || null;

						// fetch booking to check totals
						const bookingRows = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
						const booking = bookingRows && bookingRows.length ? bookingRows[0] : null;
						const bookingTotal = booking ? Number(booking.total_amount || 0) : null;

						// find booking_transactions for booking
						const btRows = await tx.select().from(booking_transactions).where(eq(booking_transactions.booking_id, bookingId)).limit(1);
						const txIdsArray = mpesaReceipt ? [mpesaReceipt] : [];

						// admin id is required
						const ADMIN_ID = process.env.ADMIN_ID_UUID;
						if (!ADMIN_ID) throw new Error("ADMIN_ID_UUID environment variable not set");

						if (btRows && btRows.length) {
							// update existing booking_transactions (increment totals and append tx id)
							// Using raw SQL for reliable arithmetic operations
							await tx.execute(sql`
                UPDATE booking_transactions
                SET total_amount = booking_transactions.total_amount + ${amount},
                    reservation_amount = booking_transactions.reservation_amount + ${paymentRow.is_reservation ? amount : 0},
                    transaction_ids = booking_transactions.transaction_ids || ${JSON.stringify(txIdsArray)}::jsonb,
                      updated_at = now()
                WHERE booking_id = ${bookingId}
              `);

              // Upsert admin_wallet and host_wallet using Drizzle ORM
              // admin balance += amount ; payable_balance += amount
              const existingAdminWallet = await tx.select().from(admin_wallets).where(eq(admin_wallets.admin_id, ADMIN_ID)).limit(1);
              if (existingAdminWallet && existingAdminWallet.length) {
                await tx.update(admin_wallets)
                  .set({
                    balance: sql`${admin_wallets.balance} + ${amount}`,
                    payable_balance: sql`${admin_wallets.payable_balance} + ${amount}`,
                    updated_at: new Date(),
                  })
                  .where(eq(admin_wallets.admin_id, ADMIN_ID));
              } else {
                await tx.insert(admin_wallets).values({
                  admin_id: ADMIN_ID,
                  balance: amount,
                  total_commission: 0,
                  payable_balance: amount,
                  total_paid_out: 0,
                  created_at: new Date(),
                  updated_at: new Date(),
                });
              }

              // host wallet available_balance += amount
              const existingHostWallet = await tx.select().from(host_wallets).where(eq(host_wallets.host_id, hostId)).limit(1);
              if (existingHostWallet && existingHostWallet.length) {
                await tx.update(host_wallets)
                  .set({
                    available_balance: sql`${host_wallets.available_balance} + ${amount}`,
                    updated_at: new Date(),
                  })
                  .where(eq(host_wallets.host_id, hostId));
              } else {
                await tx.insert(host_wallets).values({
                  host_id: hostId,
                  available_balance: amount,
                  pending_balance: 0,
                  withdrawn_total: 0,
                  created_at: new Date(),
                  updated_at: new Date(),
                });
              }

              // Check commission application: if not yet applied and totals now meet booking total -> apply
              // read current booking_transactions row again to compute prior values
              const btNowRows = await tx.select().from(booking_transactions).where(eq(booking_transactions.booking_id, bookingId)).limit(1);
              const btNow = (btNowRows && btNowRows.length) ? btNowRows[0] : null;
              const newTotal = btNow ? Number(btNow.total_amount || 0) : null;
              const priorCommissionAmount = btNow ? Number(btNow.commission_amount || 0) : 0;
              const commissionAppliedFlag = btNow ? Boolean(btNow.commission_applied) : false;

              if (!commissionAppliedFlag && bookingTotal !== null && newTotal !== null && newTotal >= Number(bookingTotal)) {
                const commission = round2(newTotal * COMMISSION_RATE);
                // update booking_transactions
                await tx.update(booking_transactions)
                  .set({
                    commission_amount: commission,
                    commission_applied: true,
                    updated_at: new Date(),
                  })
                  .where(eq(booking_transactions.booking_id, bookingId));
                
                // admin: total_commission += commission ; payable_balance -= commission
                await tx.update(admin_wallets)
                  .set({
                    total_commission: sql`${admin_wallets.total_commission} + ${commission}`,
                    payable_balance: sql`GREATEST(${admin_wallets.payable_balance} - ${commission}, 0)`,
                    updated_at: new Date(),
                  })
                  .where(eq(admin_wallets.admin_id, ADMIN_ID));
                
                // host: available_balance -= commission
                await tx.update(host_wallets)
                  .set({
                    available_balance: sql`GREATEST(${host_wallets.available_balance} - ${commission}, 0)`,
                    updated_at: new Date(),
                  })
                  .where(eq(host_wallets.host_id, hostId));
              }
						} else {
							// no booking_transactions yet: insert one
							const commissionApplied = (bookingTotal !== null && round2(amount) >= Number(bookingTotal));
							const commissionAmount = commissionApplied ? round2(amount * COMMISSION_RATE) : 0;

              const newBT = {
                id: generateId(),
                booking_id: bookingId,
                host_id: hostId,
                reservation_amount: paymentRow.is_reservation ? amount : 0,
                total_amount: amount,
                full_amount: bookingTotal || amount,
                commission_amount: commissionAmount,
                commission_applied: commissionApplied,
                transaction_ids: txIdsArray,
                created_at: new Date(),
                updated_at: new Date(),
              };

              await tx.insert(booking_transactions).values(newBT);

              // admin wallet upsert
              const existingAdminWallet2 = await tx.select().from(admin_wallets).where(eq(admin_wallets.admin_id, ADMIN_ID)).limit(1);
              if (existingAdminWallet2 && existingAdminWallet2.length) {
                await tx.update(admin_wallets)
                  .set({
                    balance: sql`${admin_wallets.balance} + ${amount}`,
                    payable_balance: sql`${admin_wallets.payable_balance} + ${amount}`,
                    updated_at: new Date(),
                  })
                  .where(eq(admin_wallets.admin_id, ADMIN_ID));
              } else {
                await tx.insert(admin_wallets).values({
                  admin_id: ADMIN_ID,
                  balance: amount,
                  total_commission: 0,
                  payable_balance: amount,
                  total_paid_out: 0,
                  created_at: new Date(),
                  updated_at: new Date(),
                });
              }

              // host wallet upsert
              const existingHostWallet2 = await tx.select().from(host_wallets).where(eq(host_wallets.host_id, hostId)).limit(1);
              if (existingHostWallet2 && existingHostWallet2.length) {
                await tx.update(host_wallets)
                  .set({
                    available_balance: sql`${host_wallets.available_balance} + ${amount}`,
                    updated_at: new Date(),
                  })
                  .where(eq(host_wallets.host_id, hostId));
              } else {
                await tx.insert(host_wallets).values({
                  host_id: hostId,
                  available_balance: amount,
                  pending_balance: 0,
                  withdrawn_total: 0,
                  created_at: new Date(),
                  updated_at: new Date(),
                });
              }

              // if commission applied right away (full payment reached), adjust admin total_commission and host remaining_balance
              if (commissionApplied && commissionAmount > 0) {
                await tx.update(admin_wallets)
                  .set({
                    total_commission: sql`${admin_wallets.total_commission} + ${commissionAmount}`,
                    payable_balance: sql`GREATEST(${admin_wallets.payable_balance} - ${commissionAmount}, 0)`,
                    updated_at: new Date(),
                  })
                  .where(eq(admin_wallets.admin_id, ADMIN_ID));
                
                await tx.update(host_wallets)
                  .set({
                    available_balance: sql`GREATEST(${host_wallets.available_balance} - ${commissionAmount}, 0)`,
                    updated_at: new Date(),
                  })
                  .where(eq(host_wallets.host_id, hostId));
              }
						}

            // Update booking payment_status
            if (paymentRow.is_reservation) {
              await tx.update(bookings)
                .set({
                  payment_status: 'partial',
                  transaction_id: mpesaReceipt,
                  is_reservation: true,
                  updated_at: new Date(),
                })
                .where(eq(bookings.id, bookingId));
            } else {
              await tx.update(bookings)
                .set({
                  payment_status: 'paid',
                  transaction_id: mpesaReceipt,
                  is_reservation: false,
                  updated_at: new Date(),
                })
                .where(eq(bookings.id, bookingId));
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
			// mapping not found — insert audit row
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

		const mapped = STK_RESULT_CODE_MAP[ResultCode] || { status: 200, message: ResultDesc || "Unknown" };
		return res.status(200).json({
			success: ResultCode === 0,
			code: ResultCode,
			message: ResultDesc,
			mappedMessage: mapped.message,
		});
	} catch (err) {
		console.error("handleCallback unexpected error:", err?.message || err);
		return res.status(200).json({
			success: false,
			code: -1,
			message: "Internal server error while processing callback",
			details: err?.message || String(err),
		});
	}
};

// --------------------------------------------------
// stkQuery - query STK status
// --------------------------------------------------
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

// --------------------------------------------------
// b2cPayment - initiate B2C payout
// --------------------------------------------------
const b2cPayment = async (req, res) => {
	try {
		const { phoneNumber, amount, host_id, remarks } = req.body;
		if (!phoneNumber || !amount || !host_id) {
			return res.status(400).json({ success: false, error: 'phoneNumber, amount, host_id required' });
		}

		const formattedPhone = phoneNumber.startsWith('0') ? `254${phoneNumber.slice(1)}` : phoneNumber;

		// Ensure security credential
		let securityCred;
		try {
			securityCred = await ensureSecurityCredential();
		} catch (err) {
			console.error('Security credential generation failed:', err?.message || err);
			return res.status(500).json({ success: false, error: 'Failed to generate security credential' });
		}

		const localRequestId = generateId();

		const requestBody = {
			InitiatorName: process.env.INITIATOR_NAME,
			SecurityCredential: securityCred,
			CommandID: 'BusinessPayment',
			Amount: amount,
			PartyA: process.env.SHORTCODE,
			PartyB: formattedPhone,
			Remarks: remarks || `Payout for host ${host_id}`,
			QueueTimeOutURL: process.env.B2C_QUEUE_TIMEOUT_URL,
			ResultURL: process.env.B2C_RESULT_URL,
			Occasion: `Payout-${localRequestId}`,
		};

		// Call Daraja
		const response = await axios.post(
			`${process.env.BASE_URL}/mpesa/b2c/v1/paymentrequest`,
			requestBody,
			{
				headers: { Authorization: `Bearer ${req.darajaToken}` },
				timeout: 20000,
			}
		);

		const remote = response.data || {};

		// Many daraja responses use "ResponseCode" either as string "0" or number 0
		const responseCode = String(remote.ResponseCode ?? remote.responseCode ?? '');
		const responseDesc = remote.ResponseDescription ?? remote.ResponseDesc ?? remote.ResponseDescription ?? '';

		// If initiation failed, do not insert anything. Return error to caller with code.
		if (responseCode !== '0') {
			return res.status(400).json({
				success: false,
				code: responseCode,
				message: responseDesc || 'B2C initiation failed',
				daraja: remote,
			});
		}

		// At this point initiation accepted by Daraja. Persist a minimal row including conversation IDs.
		const originator = remote.OriginatorConversationID ?? remote.originatorConversationID ?? null;
		const conversation = remote.ConversationID ?? remote.conversationID ?? null;

		let insertedRow = null;
		try {
			// Insert minimal row containing host_id, amount, receiverPhoneNumber and the conversation ids
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

			// fetch inserted row to return its id (some Drizzle builds don't return inserted rows)
			const rows = await db
				.select()
				.from(b2c_payouts)
				.where(eq(b2c_payouts.originator_conversation_id, originator))
				.limit(1);

			if (rows && rows.length) insertedRow = rows[0];
		} catch (err) {
			console.error('Failed to insert b2c_payouts after successful initiation:', err?.message || err);
			// We still return success since Daraja accepted the request, but inform client that DB insert failed
			return res.status(200).json({
				success: true,
				initiated: true,
				persisted: false,
				daraja: remote,
				error: 'Failed to persist b2c_payouts row (check server logs).',
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
		console.error('b2cPayment error:', err?.response?.data || err.message || err);
		return res.status(500).json({ success: false, error: err?.response?.data || err.message || String(err) });
	}
};

// --------------------------------------------------
// guestRefund - initiate B2C refund to guest
// --------------------------------------------------
const guestRefund = async (req, res) => {
	try {
		const { phoneNumber, amount, guest_id, remarks } = req.body;
		if (!phoneNumber || !amount || !guest_id) {
			return res.status(400).json({ success: false, error: 'phoneNumber, amount, guest_id required' });
		}

		const formattedPhone = phoneNumber.startsWith('0') ? `254${phoneNumber.slice(1)}` : phoneNumber;

		// Ensure security credential
		let securityCred;
		try {
			securityCred = await ensureSecurityCredential();
		} catch (err) {
			console.error('Security credential generation failed:', err?.message || err);
			return res.status(500).json({ success: false, error: 'Failed to generate security credential' });
		}

		const localRequestId = generateId();

		const requestBody = {
			InitiatorName: process.env.INITIATOR_NAME,
			SecurityCredential: securityCred,
			CommandID: 'BusinessPayment',
			Amount: amount,
			PartyA: process.env.SHORTCODE,
			PartyB: formattedPhone,
			Remarks: remarks || `Refund for guest ${guest_id}`,
			QueueTimeOutURL: process.env.REFUND_QUEUE_TIMEOUT_URL || process.env.B2C_QUEUE_TIMEOUT_URL,
			ResultURL: process.env.REFUND_RESULT_URL || process.env.B2C_RESULT_URL,
			Occasion: `Refund-${localRequestId}`,
		};

		// Call Daraja
		const response = await axios.post(
			`${process.env.BASE_URL}/mpesa/b2c/v1/paymentrequest`,
			requestBody,
			{
				headers: { Authorization: `Bearer ${req.darajaToken}` },
				timeout: 20000,
			}
		);

		const remote = response.data || {};

		// Many daraja responses use "ResponseCode" either as string "0" or number 0
		const responseCode = String(remote.ResponseCode ?? remote.responseCode ?? '');
		const responseDesc = remote.ResponseDescription ?? remote.ResponseDesc ?? remote.ResponseDescription ?? '';

		// If initiation failed, do not insert anything. Return error to caller with code.
		if (responseCode !== '0') {
			return res.status(400).json({
				success: false,
				code: responseCode,
				message: responseDesc || 'Refund initiation failed',
				daraja: remote,
			});
		}

		// At this point initiation accepted by Daraja. Persist a minimal row including conversation IDs.
		const originator = remote.OriginatorConversationID ?? remote.originatorConversationID ?? null;
		const conversation = remote.ConversationID ?? remote.conversationID ?? null;

		let insertedRow = null;
		try {
			// Insert minimal row containing guest_id, amount, receiverPhoneNumber and the conversation ids
			await db.insert(mpesa_refunds).values({
				guest_id,
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
				status: 'pending',
				created_at: new Date(),
				updated_at: new Date(),
			});

			// fetch inserted row to return its id (some Drizzle builds don't return inserted rows)
			const rows = await db
				.select()
				.from(mpesa_refunds)
				.where(eq(mpesa_refunds.originator_conversation_id, originator))
				.limit(1);

			if (rows && rows.length) insertedRow = rows[0];
		} catch (err) {
			console.error('Failed to insert mpesa_refunds after successful initiation:', err?.message || err);
			// We still return success since Daraja accepted the request, but inform client that DB insert failed
			return res.status(200).json({
				success: true,
				initiated: true,
				persisted: false,
				daraja: remote,
				error: 'Failed to persist mpesa_refunds row (check server logs).',
			});
		}

		return res.status(200).json({
			success: true,
			initiated: true,
			persisted: !!insertedRow,
			refundId: insertedRow?.id ?? null,
			daraja: remote,
		});
	} catch (err) {
		console.error('guestRefund error:', err?.response?.data || err.message || err);
		return res.status(500).json({ success: false, error: err?.response?.data || err.message || String(err) });
	}
};

// --------------------------------------------------
// guestRefundResult - handle B2C refund result callback
// --------------------------------------------------
const guestRefundResult = async (req, res) => {
	try {
		const received = req.body;
		console.log('Guest Refund Result received:', JSON.stringify(received, null, 2));

		const result = received?.Result || received?.data?.Result || received;
		if (!result || typeof result !== 'object') {
			console.warn('Invalid refund result payload:', received);
			// respond 200 to Daraja; client can check logs / UI for details
			return res.status(200).json({ success: false, message: 'Invalid refund result payload' });
		}

		const { OriginatorConversationID, ConversationID, TransactionID } = result;
		const ResultParameters = result.ResultParameters || {};
		const paramsArray = ResultParameters?.ResultParameter || [];
		const params = {};
		for (const p of paramsArray) params[p.Key] = p.Value;

		// Normalize common names/values
		const resultCode = Number(result.ResultCode ?? params.ResultCode ?? 0);
		const resultDesc = result.ResultDesc ?? params.ResultDesc ?? '';

		// Transaction amount may be under different keys
		const amount = Number(params.TransactionAmount ?? params.Amount ?? 0);
		const transactionReceipt = params.TransactionReceipt ?? params.ReceiptNo ?? TransactionID ?? null;
		const receiverName = params.ReceiverPartyPublicName ?? params.CreditPartyName ?? '';
		const completedAtRaw = params.TransactionCompletedDateTime ?? params.FinalisedTime ?? params.InitiatedTime ?? null;
		const completedAt = completedAtRaw ? parseMpesaTimestamp(completedAtRaw) : new Date();

		const recipientRegistered = String(params.B2CRecipientIsRegisteredCustomer ?? '').toUpperCase() === 'Y';
		const chargesPaidFunds = Number(params.B2CChargesPaidAccountAvailableFunds ?? params.B2CChargesPaidAccountAvailableFunds ?? 0);

		// Find the associated mpesa_refunds row (expect it to exist because we inserted on initiation success)
		let refundRow = null;
		try {
			if (OriginatorConversationID) {
				const rows = await db.select().from(mpesa_refunds).where(eq(mpesa_refunds.originator_conversation_id, OriginatorConversationID)).limit(1);
				if (rows && rows.length) refundRow = rows[0];
			}
			if (!refundRow && ConversationID) {
				const rows2 = await db.select().from(mpesa_refunds).where(eq(mpesa_refunds.conversation_id, ConversationID)).limit(1);
				if (rows2 && rows2.length) refundRow = rows2[0];
			}
			// fallback: try match by receiverPhoneNumber + amount for the most recent uncompleted row
			if (!refundRow && receiverName) {
				const phoneToken = String(receiverName).split(/\s|-/)[0] || null;
				const cleanPhone = phoneToken ? phoneToken.replace(/\D/g, '') : null;
				if (cleanPhone) {
					const rows3 = await db
						.select()
						.from(mpesa_refunds)
						.where(eq(mpesa_refunds.receiverPhoneNumber, cleanPhone))
						.where(eq(mpesa_refunds.amount, amount))
						.where(eq(mpesa_refunds.result_code, null))
						.orderBy(sql`created_at DESC`)
						.limit(1);
					if (rows3 && rows3.length) refundRow = rows3[0];
				}
			}
		} catch (err) {
			console.error('Error finding mpesa_refunds row in callback:', err?.message || err);
		}

		if (!refundRow) {
			console.warn('No matching mpesa_refunds row found for callback. Originator/Conversation/Receiver/Amount:', {
				OriginatorConversationID,
				ConversationID,
				receiverName,
				amount,
			});
			// Must ACK Daraja with 200; report to logs / UI for manual reconciliation
			return res.status(200).json({
				success: resultCode === 0,
				code: resultCode,
				message: resultDesc,
				persisted: false,
				note: 'No matching mpesa_refunds row found to update. Check initiation step.',
			});
		}

		// Idempotency: if transaction_id already recorded, skip
		try {
			const existing = await db.select().from(mpesa_refunds).where(eq(mpesa_refunds.transaction_id, TransactionID)).limit(1);
			if (existing && existing.length) {
				console.log('Duplicate refund result already processed:', TransactionID);
				return res.status(200).json({ success: true, code: resultCode, message: 'Already processed', persisted: true });
			}
		} catch (err) {
			console.error('Error checking existing transaction id in mpesa_refunds:', err?.message || err);
			// continue
		}

		// Determine status based on result code
		const status = resultCode === 0 ? 'refunded' : 'failed';

		// If the resultCode is success (0) we write the detailed fields; otherwise write only result_code/result_desc for audit.
		if (resultCode === 0) {
			try {
				await db.update(mpesa_refunds)
					.set({
						transaction_id: TransactionID ?? refundRow.transaction_id,
						transaction_receipt: transactionReceipt ?? refundRow.transaction_receipt,
						receiver_name: receiverName ?? refundRow.receiver_name,
						completed_at: completedAt ?? refundRow.completed_at,
						b2c_recipient_is_registered: recipientRegistered,
						b2c_charges_paid_funds: chargesPaidFunds,
						result_code: resultCode,
						result_desc: resultDesc,
						status: status,
						updated_at: new Date(),
					})
					.where(eq(mpesa_refunds.id, refundRow.id));
			} catch (err) {
				console.error('Failed to update mpesa_refunds with success result:', err?.message || err);
				return res.status(200).json({ success: false, code: resultCode, message: resultDesc, persisted: false, error: String(err?.message || err) });
			}

			return res.status(200).json({ success: true, code: resultCode, message: resultDesc, persisted: true, refundId: refundRow.id });
		} else {
			// persist result_code/result_desc for failed/partial requests (audit)
			try {
				await db.update(mpesa_refunds)
					.set({
						result_code: resultCode,
						result_desc: resultDesc,
						status: status,
						updated_at: new Date(),
					})
					.where(eq(mpesa_refunds.id, refundRow.id));
			} catch (err) {
				console.error('Failed to update mpesa_refunds with failure result:', err?.message || err);
				return res.status(200).json({ success: false, code: resultCode, message: resultDesc, persisted: false, error: String(err?.message || err) });
			}

			return res.status(200).json({ success: false, code: resultCode, message: resultDesc, persisted: true, refundId: refundRow.id });
		}
	} catch (err) {
		console.error('guestRefundResult error:', err?.message || err);
		return res.status(200).json({ success: false, message: 'Internal server error processing refund result', details: String(err?.message || err) });
	}
};

// --------------------------------------------------
// b2cResult - handle B2C payout result callback
// --------------------------------------------------
const b2cResult = async (req, res) => {
	try {
		const received = req.body;
		console.log('B2C Result received:', JSON.stringify(received, null, 2));

		const result = received?.Result || received?.data?.Result || received;
		if (!result || typeof result !== 'object') {
			console.warn('Invalid B2C result payload:', received);
			// respond 200 to Daraja; client can check logs / UI for details
			return res.status(200).json({ success: false, message: 'Invalid B2C result payload' });
		}

		const { OriginatorConversationID, ConversationID, TransactionID } = result;
		const ResultParameters = result.ResultParameters || {};
		const paramsArray = ResultParameters?.ResultParameter || [];
		const params = {};
		for (const p of paramsArray) params[p.Key] = p.Value;

		// Normalize common names/values
		const resultCode = Number(result.ResultCode ?? params.ResultCode ?? 0);
		const resultDesc = result.ResultDesc ?? params.ResultDesc ?? '';

		// Transaction amount may be under different keys
		const amount = Number(params.TransactionAmount ?? params.Amount ?? 0);
		const transactionReceipt = params.TransactionReceipt ?? params.ReceiptNo ?? TransactionID ?? null;
		const receiverName = params.ReceiverPartyPublicName ?? params.CreditPartyName ?? '';
		const completedAtRaw = params.TransactionCompletedDateTime ?? params.FinalisedTime ?? params.InitiatedTime ?? null;
		const completedAt = completedAtRaw ? parseMpesaTimestamp(completedAtRaw) : new Date();

		const recipientRegistered = String(params.B2CRecipientIsRegisteredCustomer ?? '').toUpperCase() === 'Y';
		const chargesPaidFunds = Number(params.B2CChargesPaidAccountAvailableFunds ?? params.B2CChargesPaidAccountAvailableFunds ?? 0);

		// Find the associated b2c_payouts row (expect it to exist because we inserted on initiation success)
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
			// fallback: try match by receiverPhoneNumber + amount for the most recent uncompleted row
			if (!payoutRow && receiverName) {
				const phoneToken = String(receiverName).split(/\s|-/)[0] || null;
				const cleanPhone = phoneToken ? phoneToken.replace(/\D/g, '') : null;
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
			console.error('Error finding b2c_payouts row in callback:', err?.message || err);
		}

		if (!payoutRow) {
			console.warn('No matching b2c_payouts row found for callback. Originator/Conversation/Receiver/Amount:', {
				OriginatorConversationID,
				ConversationID,
				receiverName,
				amount,
			});
			// Must ACK Daraja with 200; report to logs / UI for manual reconciliation
			return res.status(200).json({
				success: resultCode === 0,
				code: resultCode,
				message: resultDesc,
				persisted: false,
				note: 'No matching b2c_payouts row found to update. Check initiation step.',
			});
		}

		// Idempotency: if transaction_id already recorded, skip
		try {
			const existing = await db.select().from(b2c_payouts).where(eq(b2c_payouts.transaction_id, TransactionID)).limit(1);
			if (existing && existing.length) {
				console.log('Duplicate B2C result already processed:', TransactionID);
				return res.status(200).json({ success: true, code: resultCode, message: 'Already processed', persisted: true });
			}
		} catch (err) {
			console.error('Error checking existing transaction id in b2c_payouts:', err?.message || err);
			// continue
		}

		// If the resultCode is success (0) we write the detailed fields; otherwise write only result_code/result_desc for audit.
		if (resultCode === 0) {
			try {
				await db.update(b2c_payouts)
					.set({
						transaction_id: TransactionID ?? payoutRow.transaction_id,
						transaction_receipt: transactionReceipt ?? payoutRow.transaction_receipt,
						receiver_name: receiverName ?? payoutRow.receiver_name,
						completed_at: completedAt ?? payoutRow.completed_at,
						b2c_recipient_is_registered: recipientRegistered,
						b2c_charges_paid_funds: chargesPaidFunds,
						result_code: resultCode,
						result_desc: resultDesc,
						updated_at: new Date(),
					})
					.where(eq(b2c_payouts.id, payoutRow.id));
			} catch (err) {
				console.error('Failed to update b2c_payouts with success result:', err?.message || err);
				return res.status(200).json({ success: false, code: resultCode, message: resultDesc, persisted: false, error: String(err?.message || err) });
			}

			return res.status(200).json({ success: true, code: resultCode, message: resultDesc, persisted: true, payoutId: payoutRow.id });
		} else {
			// persist result_code/result_desc for failed/partial requests (audit)
			try {
				await db.update(b2c_payouts)
					.set({
						result_code: resultCode,
						result_desc: resultDesc,
						updated_at: new Date(),
					})
					.where(eq(b2c_payouts.id, payoutRow.id));
			} catch (err) {
				console.error('Failed to update b2c_payouts with failure result:', err?.message || err);
				return res.status(200).json({ success: false, code: resultCode, message: resultDesc, persisted: false, error: String(err?.message || err) });
			}

			return res.status(200).json({ success: false, code: resultCode, message: resultDesc, persisted: true, payoutId: payoutRow.id });
		}
	} catch (err) {
		console.error('b2cResult error:', err?.message || err);
		return res.status(200).json({ success: false, message: 'Internal server error processing B2C result', details: String(err?.message || err) });
	}
};

// Exports
module.exports = {
	sendStkPush,
	handleCallback,
	stkQuery,
	b2cPayment,
	b2cResult,
	guestRefund,
	guestRefundResult,
	// other helpers (keep default simple ack endpoints)
	b2cQueueTimeout: (req, res) => {
		console.log("B2C Queue Timeout", req.body);
		return res.status(200).json({ message: "ok" });
	},
	guestRefundQueueTimeout: (req, res) => {
		console.log("Guest Refund Queue Timeout", req.body);
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
