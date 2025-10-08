// routes/payment.js
/**
 * Payment routes for STK and B2C flows.
 * - All C2B / B2C endpoints are defined here.
 * - darajaAuthMiddleware protects endpoints that call Daraja (expects req.darajaToken).
 */

const express = require("express");
const router = express.Router();

const darajaAuthMiddleware = require("../middlewares/darajaAuthMiddleware");
const {
	sendStkPush,
	handleCallback,
	stkQuery,
	b2cPayment,
	b2cQueueTimeout,
	b2cResult,
	guestRefund,
	guestRefundResult,
	guestRefundQueueTimeout,
	b2cAccountBalance,
	accountBalanceResult,
	accountBalanceQueueTimeout,
	checkB2CTransactionStatus,
	b2cCheckTransactionQueueTimeout,
	b2cCheckTransactionResult
} = require("../controllers/paymentController");

// Health check endpoint for payment routes - welcome message
router.get('/welcome', (req, res) => {
	res.status(200).json({message: 'Hello from Payment Routes - Mystay Daraja API'});
});

/**
 * POST /api/v1/payment/send-stk-push
 * Initiate STK push (C2B).
 * Body: { phoneNumber, amount, guest_id, booking_id, host_id }
 */
router.post("/send-stk-push", darajaAuthMiddleware, sendStkPush);

/**
 * POST /api/v1/payment/callback
 * Daraja STK callback endpoint (public). Daraja posts here with push result.
 * We should return 200 quickly. Processing is done inside the controller.
 */
router.post("/callback", handleCallback);

/**
 * POST /api/v1/payment/stk-query
 * Query STK status (protected).
 * Body: { checkoutRequestId }
 */
router.post("/stk-query", darajaAuthMiddleware, stkQuery);

/**
 * POST /api/v1/payment/b2c
 * Initiate B2C payout.
 * Body: { phoneNumber, amount, host_id, remarks }
 */
router.post("/b2c", darajaAuthMiddleware, b2cPayment);

/**
 * POST /api/v1/payment/b2c-result
 * Daraja will POST result callbacks here for B2C payouts.
 */
router.post("/b2c-result", b2cResult);

/**
 * POST /api/v1/payment/b2c-queue-timeout
 * Daraja will POST when B2C queue times out.
 */
router.post("/b2c-queue-timeout", b2cQueueTimeout);

/**
 * POST /api/v1/payment/b2c-account-balance
 * Protected endpoint to request account balance from Daraja.
 */
router.post("/b2c-account-balance", darajaAuthMiddleware, b2cAccountBalance);

/**
 * POST /api/v1/payment/b2c-account-balance-results
 * Daraja posts account balance results here.
 */
router.post("/b2c-account-balance-results", accountBalanceResult);

/**
 * POST /api/v1/payment/b2c-account-balance-queue-timeout
 */
router.post("/b2c-account-balance-queue-timeout", accountBalanceQueueTimeout);

/**
 * POST /api/v1/payment/b2c-check-transaction-status
 * Protected endpoint to query transaction status.
 */
router.post("/b2c-check-transaction-status", darajaAuthMiddleware, checkB2CTransactionStatus);

/**
 * POST /api/v1/payment/b2c-check-transaction-queue
 */
router.post("/b2c-check-transaction-queue", b2cCheckTransactionQueueTimeout);

/**
 * POST /api/v1/payment/b2c-check-transaction-results
 */
router.post("/b2c-check-transaction-results", b2cCheckTransactionResult);

/**
 * POST /api/v1/payment/guest-refund
 * Initiate B2C refund to guest.
 * Body: { phoneNumber, amount, guest_id, remarks }
 */
router.post("/guest-refund", darajaAuthMiddleware, guestRefund);

/**
 * POST /api/v1/payment/guest-refund-result
 * Daraja will POST refund result callbacks here.
 */
router.post("/guest-refund-result", guestRefundResult);

/**
 * POST /api/v1/payment/guest-refund-queue-timeout
 * Daraja will POST when refund queue times out.
 */
router.post("/guest-refund-queue-timeout", guestRefundQueueTimeout);

module.exports = router;
