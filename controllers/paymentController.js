// controllers/paymentController.js
/**
 * Simplified payment controller
 * - Only persists stk_payments, b2c_payouts and booking_transactions.
 * - sendStkPush inserts an initial stk_payments mapping (no pending_stk table).
 * - handleCallback updates stk_payments and upserts booking_transactions (commission applied once).
 * - b2cResult persists b2c_payouts (no wallet updates).
 *
 * Responses for callbacks include a success boolean and mapped message based on ResultCode.
 */

const axios = require("axios");
const moment = require("moment");
const crypto = require("crypto");
const { db } = require("../db/client");
const { eq, sql } = require("drizzle-orm");

const {
	stk_payments,
	b2c_payouts,
	booking_transactions,
	bookings,
	profiles,
} = require("../db/schema");

// const { sql } = require("../db/pg");
const { generateSecurityCredential } = require("../credentials/generateSecurityCredential");

const COMMISSION_RATE = 0.125; // 12.5%

// Cached security credential generation helpers (used only by B2C/account balance endpoints)
let securityCredential = null;
let securityCredentialPromise = null;
async function ensureSecurityCredential() {
	if (securityCredential) return securityCredential;
	if (securityCredentialPromise) return securityCredentialPromise;
	const initiatorPassword = process.env.INITIATOR_PASSWORD;
	const certPath = path.join(__dirname, 'credentials', 'ProductionCertificate.cer');
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
 * POST /api/v1/payment/send-stk-push
 *
 * Body:
 * {
 *   phoneNumber, amount, guest_id, booking_id, host_id, is_reservation (bool)
 * }
 *
 * Initiates STK push and stores an initial stk_payments row that acts as our mapping
 * (so the callback can find booking_id/host_id by checkout_request_id).
 */
const sendStkPush = async (req, res) => {
	try {
		const { phoneNumber, amount, guest_id, booking_id, host_id, is_reservation = false, booking_title } = req.body;

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
			CallBackURL: process.env.CALLBACK_URL, // must point to /api/v1/payment/callback
			AccountReference: `Booking Ref:${booking_title}`,
			TransactionDesc: `Payment for mystay booking ${booking_title}`,
		};

		// call Daraja
		const response = await axios.post(`${process.env.BASE_URL}/mpesa/stkpush/v1/processrequest`, requestBody, {
			headers: { Authorization: `Bearer ${req.darajaToken}` },
			timeout: 20000,
		});

		const data = response.data || {};
		const merchantRequestId = data.MerchantRequestID || data.merchantRequestId || null;
		const checkoutRequestId = data.CheckoutRequestID || data.checkoutRequestId || null;

		// Insert initial stk_payments row so callback can reconcile (acts like pending mapping)
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
			// Log but don't fail the operation: the push was sent and Daraja expects a 200
			console.error("Failed to insert initial stk_payments mapping:", err?.message || err);
		}

		return res.status(200).json({ status: "success", message: "STK push initiated", data });
	} catch (err) {
		console.error("sendStkPush error:", err?.response?.data || err.message || err);
		return res.status(500).json({ error: "Failed to initiate STK push", details: err?.response?.data || err.message });
	}
};

/**
 * POST /api/v1/payment/callback
 *
 * Daraja STK callback endpoint.
 * - updates or inserts stk_payments
 * - if success: upserts booking_transactions (commission applied ONCE)
 *
 * Returns HTTP 200 with JSON containing success flag and mapped message.
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

		// Find existing stk_payments mapping (inserted by sendStkPush)
		let existingRows = [];
		try {
			existingRows = await db
				.select()
				.from(stk_payments)
				.where(eq(stk_payments.checkout_request_id, CheckoutRequestID))
				.limit(1);
		} catch (e) {
			console.error("Error querying stk_payments by checkout_request_id:", e?.message || e);
			existingRows = [];
		}

		if (!existingRows || existingRows.length === 0) {
			// fallback to merchantRequestId
			try {
				existingRows = await db
					.select()
					.from(stk_payments)
					.where(eq(stk_payments.merchant_request_id, MerchantRequestID))
					.limit(1);
			} catch (e) {
				console.error("Error querying stk_payments by merchant_request_id:", e?.message || e);
				existingRows = [];
			}
		}

		let paymentRow = existingRows && existingRows.length ? existingRows[0] : null;

		// If the request was successful (ResultCode === 0), we will update/insert and then upsert booking_transactions
		// If failed, we still update/insert stk_payments for auditing but do no booking_transactions changes.
		if (paymentRow) {
			// Update existing stk_payments row (use Drizzle update for type safety)
			try {
				// Ensure id is a proper number
				const pk = Number(paymentRow.id);
				if (!pk || Number.isNaN(pk)) {
					throw new Error(`Invalid paymentRow.id: ${String(paymentRow.id)}`);
				}

				// Coerce txDate to a Date (Drizzle/postgres.js accepts Date objects)
				const safeTxDate = txDate instanceof Date ? txDate : new Date(txDate);

				await db.update(stk_payments)
					.set({
						mpesa_receipt: mpesaReceipt ?? null,
						transaction_date: safeTxDate,
						result_code: ResultCode ?? null,
						result_desc: ResultDesc ?? null,
						updated_at: new Date(),
					})
					.where(eq(stk_payments.id, pk));

			} catch (err) {
				console.error("Failed to update existing stk_payments (drizzle update):", err);
			}

		} else {
			// Insert a new audit row (no guest/booking/host mapping)
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

				// try to retrieve the newly inserted row to use its booking_id etc (will be null)
				const rows = await db
					.select()
					.from(stk_payments)
					.where(eq(stk_payments.checkout_request_id, CheckoutRequestID))
					.limit(1);
				paymentRow = rows && rows.length ? rows[0] : null;
			} catch (err) {
				console.error("Failed to insert stk_payments audit row:", err?.message || err);
			}
		}

		// Decide success / failure mapping to return (still always return HTTP 200)
		const mapped = STK_RESULT_CODE_MAP[ResultCode] || { status: 200, message: ResultDesc || "Unknown" };
		const responsePayload = {
			success: ResultCode === 0,
			code: ResultCode,
			message: ResultDesc,
			mappedMessage: mapped.message,
		};

		// If successful and booking_id present in paymentRow, upsert booking_transactions
		if (ResultCode === 0 && paymentRow && paymentRow.booking_id) {
			const bookingId = paymentRow.booking_id;
			const hostId = paymentRow.host_id || null;
			// Use tx to ensure atomicity between writing booking_transactions and updating stk_payments (already updated above)
			try {
				await db.transaction(async (tx) => {
					// Find existing booking_transactions
					const btRows = await tx.select().from(booking_transactions).where(eq(booking_transactions.booking_id, bookingId)).limit(1);

					const txIdsArray = mpesaReceipt ? [mpesaReceipt] : [];

					if (btRows && btRows.length) {
						// Use Drizzle update to safely increment total_amount and append JSONB transaction id
						try {
							await tx.update(booking_transactions)
								.set({
									// increment total_amount atomically using SQL fragment
									total_amount: sql`booking_transactions.total_amount + ${amount}`,
									// append the new tx id(s) to the jsonb array
									transaction_ids: sql`booking_transactions.transaction_ids || ${JSON.stringify(txIdsArray)}::jsonb`,
									updated_at: new Date(),
								})
								.where(eq(booking_transactions.booking_id, bookingId));
						} catch (err) {
							console.error("Failed to update booking_transactions via Drizzle:", err);
							throw err; // rethrow so transaction can rollback and we capture the error
						}
					}
					else {
						// insert new booking_transactions with commission = amount * COMMISSION_RATE (first payment)
						const commissionAmount = round2(amount * COMMISSION_RATE);
						// try to include is_reservation and reservation_fee if those columns exist
						await tx.insert(booking_transactions).values({
							id: generateId(),
							booking_id: bookingId,
							host_id: hostId,
							// some schemas include is_reservation/reservation_fee; if present in your DB they will be set to these values.
							// To avoid DB errors, ensure your booking_transactions table includes these columns OR remove them here.
							// If your booking_transactions schema DOES include them, you can pass:
							// is_reservation: paymentRow.is_reservation ?? false,
							// reservation_fee: paymentRow.is_reservation ? amount : 0,
							commission_amount: commissionAmount,
							total_amount: amount,
							transaction_ids: txIdsArray,
							created_at: new Date(),
							updated_at: new Date(),
						});
					}
				});
			} catch (err) {
				console.error("Error upserting booking_transactions:", err?.message || err);
				// still respond success to Daraja, but include a note in the response
				responsePayload.upsertBookingTransactionsError = err?.message || String(err);
			}
		}

		// Always reply 200 to Daraja (they expect HTTP 200). Return our payload so front-end can inspect.
		return res.status(200).json(responsePayload);
	} catch (err) {
		console.error("handleCallback unexpected error:", err?.message || err);
		// Always ack Daraja with 200 to avoid retries, but indicate server error in body
		return res.status(200).json({
			success: false,
			code: -1,
			message: "Internal server error while processing callback",
			details: err?.message || String(err),
		});
	}
};

/**
 * STK Query endpoint
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
 * b2cPayment: initiate B2C
 *
 * This endpoint still sends the B2C request to Daraja. We don't persist payout_requests anymore,
 * but we will persist the final result in b2cResult when Daraja calls back.
 */
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



/**
 * b2cResult: Daraja posts the B2C result here.
 * We only persist the B2C result into b2c_payouts and return a success flag.
 */
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

		const { OriginatorConversationID, ConversationID, TransactionID, ResultParameters } = result;
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
			}

			// still acknowledge to Daraja
			return res.status(200).json({ success: false, code: resultCode, message: resultDesc, persisted: true, payoutId: payoutRow.id });
		}
	} catch (err) {
		console.error('b2cResult unexpected error:', err?.message || err);
		// Always ack Daraja with 200
		return res.status(200).json({ success: false, message: 'B2C result received but server error processing it. Check logs.' });
	}
};


/**
 * b2cAccountBalance - initiate
 */
const b2cAccountBalance = async (req, res) => {
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
};

/**
 * accountBalanceResult - parse and return friendly map
 */
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

const accountBalanceResult = async (req, res) => {
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
};

const accountBalanceQueueTimeout = async (req, res) => {
	console.log("Account Balance Queue Timeout received:", JSON.stringify(req.body, null, 2));
	return res.status(200).json({ message: "Account balance queue timeout acknowledged" });
};

const checkB2CTransactionStatus = async (req, res) => {
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
};

const b2cCheckTransactionQueueTimeout = async (req, res) => {
	console.log("B2C Check Transaction Queue Timeout", JSON.stringify(req.body, null, 2));
	return res.status(200).json({ message: "B2C check queue timeout acknowledged" });
};

const b2cCheckTransactionResult = async (req, res) => {
	console.log("B2C Check Transaction Result", JSON.stringify(req.body, null, 2));
	return res.status(200).json({ message: "B2C check transaction result processed", data: req.body });
};

module.exports = {
	sendStkPush,
	handleCallback,
	stkQuery,
	b2cPayment,
	b2cQueueTimeout: (req, res) => { console.log("B2C Queue Timeout", req.body); return res.status(200).json({ message: "ok" }); },
	b2cResult,
	b2cAccountBalance,
	accountBalanceQueueTimeout,
	accountBalanceResult,
	checkB2CTransactionStatus,
	b2cCheckTransactionQueueTimeout,
	b2cCheckTransactionResult,
};
