# 🔄 M-Pesa Guest Refunds Implementation Guide

## ✅ Complete Implementation Summary

I've successfully implemented a complete guest refund system using M-Pesa B2C API. Here's what was created:

### 1. Database Table: `mpesa_refunds`
- **Purpose**: Track all M-Pesa refunds to guests
- **Status tracking**: `pending`, `refunded`, `failed`
- **Full audit trail** with M-Pesa transaction details

### 2. Controller Functions
- ✅ `guestRefund()` - Initiates refund to guest
- ✅ `guestRefundResult()` - Handles M-Pesa callback
- ✅ `guestRefundQueueTimeout()` - Handles timeout callbacks

### 3. API Endpoints
- ✅ `POST /api/v1/payment/guest-refund` - Initiate refund
- ✅ `POST /api/v1/payment/guest-refund-result` - Callback endpoint
- ✅ `POST /api/v1/payment/guest-refund-queue-timeout` - Timeout callback

---

## 📋 Step 1: Create the Database Table

Run this SQL in your Supabase SQL Editor:

\`\`\`sql
-- SQL to create mpesa_refunds table on Supabase
-- Based on b2c_payouts structure with guest_id and status field

CREATE TABLE IF NOT EXISTS mpesa_refunds (
  id SERIAL PRIMARY KEY,
  guest_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiverPhoneNumber TEXT,
  originator_conversation_id VARCHAR(100),
  conversation_id VARCHAR(100),
  transaction_id VARCHAR(100),
  transaction_receipt VARCHAR(100),
  amount NUMERIC(12, 2) NOT NULL,
  receiver_name TEXT,
  completed_at TIMESTAMP,
  b2c_recipient_is_registered BOOLEAN,
  b2c_charges_paid_funds NUMERIC(12, 2),
  result_code INTEGER,
  result_desc TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'refunded', 'failed')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_mpesa_refunds_guest_id ON mpesa_refunds(guest_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_refunds_originator_conversation_id ON mpesa_refunds(originator_conversation_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_refunds_transaction_id ON mpesa_refunds(transaction_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_refunds_status ON mpesa_refunds(status);
CREATE INDEX IF NOT EXISTS idx_mpesa_refunds_created_at ON mpesa_refunds(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE mpesa_refunds IS 'Tracks M-Pesa refunds to guests via B2C API';
COMMENT ON COLUMN mpesa_refunds.status IS 'Refund status: pending, refunded, or failed';
\`\`\`

---

## 🔧 Step 2: Configure Environment Variables

Add these to your `.env` file (optional - defaults to B2C URLs if not set):

\`\`\`env
# Guest Refund Callback URLs (Optional - falls back to B2C URLs)
REFUND_RESULT_URL=https://yourdomain.com/api/v1/payment/guest-refund-result
REFUND_QUEUE_TIMEOUT_URL=https://yourdomain.com/api/v1/payment/guest-refund-queue-timeout
\`\`\`

**Note**: If you don't set these, the system will use the existing B2C URLs:
- Falls back to `B2C_RESULT_URL`
- Falls back to `B2C_QUEUE_TIMEOUT_URL`

---

## 🚀 Step 3: Using the Guest Refund System

### Initiate a Refund

**Endpoint**: `POST /api/v1/payment/guest-refund`

**Headers**:
\`\`\`json
{
  "Content-Type": "application/json"
}
\`\`\`

**Request Body**:
\`\`\`json
{
  "phoneNumber": "0712345678",
  "amount": 500,
  "guest_id": "550e8400-e29b-41d4-a716-446655440000",
  "remarks": "Booking cancellation refund"
}
\`\`\`

**Success Response** (200):
\`\`\`json
{
  "success": true,
  "initiated": true,
  "persisted": true,
  "refundId": 123,
  "daraja": {
    "ConversationID": "AG_20231115_...",
    "OriginatorConversationID": "29115-34620561-1",
    "ResponseCode": "0",
    "ResponseDescription": "Accept the service request successfully."
  }
}
\`\`\`

**Error Response** (400):
\`\`\`json
{
  "success": false,
  "code": "1",
  "message": "Insufficient funds in the till",
  "daraja": { ... }
}
\`\`\`

---

## 📊 Step 4: Track Refund Status

### Query Refunds by Guest

\`\`\`sql
-- Get all refunds for a specific guest
SELECT 
  id,
  amount,
  status,
  transaction_receipt,
  result_desc,
  created_at,
  completed_at
FROM mpesa_refunds
WHERE guest_id = 'YOUR_GUEST_UUID'
ORDER BY created_at DESC;
\`\`\`

### Query Refunds by Status

\`\`\`sql
-- Get all pending refunds
SELECT * FROM mpesa_refunds 
WHERE status = 'pending'
ORDER BY created_at DESC;

-- Get all successful refunds
SELECT * FROM mpesa_refunds 
WHERE status = 'refunded'
ORDER BY created_at DESC;

-- Get all failed refunds
SELECT * FROM mpesa_refunds 
WHERE status = 'failed'
ORDER BY created_at DESC;
\`\`\`

### Get Refund Summary

\`\`\`sql
-- Total refunds by status
SELECT 
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM mpesa_refunds
GROUP BY status;
\`\`\`

---

## 🔄 How the Refund Flow Works

### Flow Diagram:

\`\`\`
1. Client → POST /guest-refund
   ├─ Validates: phoneNumber, amount, guest_id
   ├─ Generates security credential
   └─ Calls M-Pesa Daraja B2C API

2. Daraja API Response
   ├─ Success (ResponseCode: 0)
   │   └─ Insert record in mpesa_refunds (status: pending)
   └─ Failure (ResponseCode: != 0)
       └─ Return error to client

3. M-Pesa processes refund
   └─ Sends callback → POST /guest-refund-result

4. Callback Handler
   ├─ Finds refund record by OriginatorConversationID
   ├─ Updates record with:
   │   ├─ transaction_id
   │   ├─ transaction_receipt  
   │   ├─ receiver_name
   │   ├─ completed_at
   │   └─ status: 'refunded' or 'failed'
   └─ Returns ACK to M-Pesa
\`\`\`

---

## 🔍 Table Schema Details

### mpesa_refunds Columns:

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `guest_id` | UUID | Reference to profiles table |
| `receiverPhoneNumber` | TEXT | Guest's phone number (254...) |
| `originator_conversation_id` | VARCHAR(100) | M-Pesa's unique request ID |
| `conversation_id` | VARCHAR(100) | M-Pesa's conversation ID |
| `transaction_id` | VARCHAR(100) | M-Pesa transaction ID |
| `transaction_receipt` | VARCHAR(100) | M-Pesa receipt number |
| `amount` | NUMERIC(12,2) | Refund amount |
| `receiver_name` | TEXT | Name on M-Pesa account |
| `completed_at` | TIMESTAMP | When refund completed |
| `b2c_recipient_is_registered` | BOOLEAN | If recipient is registered M-Pesa user |
| `b2c_charges_paid_funds` | NUMERIC(12,2) | Available funds after charges |
| `result_code` | INTEGER | M-Pesa result code (0 = success) |
| `result_desc` | TEXT | M-Pesa result description |
| **`status`** | TEXT | **pending / refunded / failed** |
| `created_at` | TIMESTAMP | When record was created |
| `updated_at` | TIMESTAMP | Last update timestamp |

---

## 💡 Example Usage Scenarios

### Scenario 1: Booking Cancellation Refund

\`\`\`javascript
// When a guest cancels a booking and needs a refund
const refundData = {
  phoneNumber: guest.phone,
  amount: booking.total_amount,
  guest_id: guest.id,
  remarks: \`Refund for cancelled booking \${booking.id}\`
};

const response = await fetch('/api/v1/payment/guest-refund', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(refundData)
});
\`\`\`

### Scenario 2: Partial Refund

\`\`\`javascript
// Refund only part of the payment
const partialRefund = {
  phoneNumber: '0712345678',
  amount: 200, // Only refund 200 out of 500 paid
  guest_id: guest.id,
  remarks: 'Partial refund - service adjustment'
};
\`\`\`

### Scenario 3: Check Refund Status

\`\`\`javascript
// Query the database to check refund status
const refund = await db
  .select()
  .from(mpesa_refunds)
  .where(eq(mpesa_refunds.id, refundId))
  .limit(1);

if (refund[0].status === 'refunded') {
  console.log('Refund completed:', refund[0].transaction_receipt);
} else if (refund[0].status === 'failed') {
  console.log('Refund failed:', refund[0].result_desc);
} else {
  console.log('Refund pending...');
}
\`\`\`

---

## 🛡️ Error Handling

### Common M-Pesa Error Codes:

| Code | Description | Action |
|------|-------------|--------|
| `0` | Success | Refund processed ✅ |
| `1` | Insufficient funds | Contact M-Pesa support |
| `8` | Invalid recipient | Verify phone number |
| `17` | Duplicate request | Check for existing refund |
| `2001` | Wrong credentials | Check INITIATOR_PASSWORD |

### Handling Failed Refunds:

\`\`\`sql
-- Find failed refunds that need retry
SELECT 
  id,
  guest_id,
  amount,
  result_code,
  result_desc,
  created_at
FROM mpesa_refunds
WHERE status = 'failed'
  AND result_code NOT IN (8, 17) -- Exclude unretryable errors
ORDER BY created_at DESC;
\`\`\`

---

## 📈 Monitoring & Reports

### Daily Refund Report

\`\`\`sql
-- Get refund statistics for today
SELECT 
  DATE(created_at) as refund_date,
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount,
  AVG(amount) as avg_amount
FROM mpesa_refunds
WHERE created_at >= CURRENT_DATE
GROUP BY DATE(created_at), status
ORDER BY refund_date DESC;
\`\`\`

### Guest Refund History

\`\`\`sql
-- Full refund history for a guest
SELECT 
  r.id,
  r.amount,
  r.status,
  r.transaction_receipt,
  r.receiver_name,
  r.result_desc,
  r.created_at,
  r.completed_at,
  p.email as guest_email
FROM mpesa_refunds r
JOIN profiles p ON r.guest_id = p.id
WHERE r.guest_id = 'YOUR_GUEST_UUID'
ORDER BY r.created_at DESC;
\`\`\`

---

## 🔐 Security Considerations

1. **Endpoint Protection**: The `/guest-refund` endpoint is protected by `darajaAuthMiddleware`
2. **Idempotency**: Duplicate callbacks are detected and handled gracefully
3. **Validation**: All inputs are validated before processing
4. **Audit Trail**: Complete history of all refund attempts
5. **Status Tracking**: Know exactly what happened with each refund

---

## 🆘 Troubleshooting

### Refund stuck in "pending"?

1. Check if callback URL is reachable: `REFUND_RESULT_URL`
2. Check M-Pesa dashboard for transaction status
3. Query refund by conversation ID
4. Wait up to 5 minutes for callback

### Callback not received?

1. Verify callback URLs are publicly accessible
2. Check server logs for incoming requests
3. Ensure no firewall blocking M-Pesa IPs
4. Test with M-Pesa sandbox first

### How to manually update status?

\`\`\`sql
-- Manually mark refund as refunded (use with caution!)
UPDATE mpesa_refunds
SET 
  status = 'refunded',
  completed_at = NOW(),
  updated_at = NOW()
WHERE id = REFUND_ID;
\`\`\`

---

## ✨ Features Implemented

✅ **Complete B2C Integration** - Uses M-Pesa Business to Customer API  
✅ **Status Tracking** - Tracks pending, refunded, and failed statuses  
✅ **Full Audit Trail** - Every refund attempt is logged  
✅ **Idempotent Callbacks** - Prevents duplicate processing  
✅ **Error Handling** - Graceful handling of all failure scenarios  
✅ **Fallback URLs** - Uses B2C URLs if refund URLs not configured  
✅ **Database Indexes** - Optimized for fast queries  
✅ **Proper Validation** - All inputs validated before processing  

---

## 🎯 Next Steps

1. ✅ Run the SQL to create `mpesa_refunds` table
2. ✅ Add callback URLs to `.env` (optional)
3. ✅ Test with M-Pesa sandbox
4. ✅ Integrate into your booking cancellation flow
5. ✅ Set up monitoring for failed refunds
6. ✅ Create admin dashboard to view refund history

---

## 📞 API Endpoints Summary

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/guest-refund` | POST | Required | Initiate refund |
| `/guest-refund-result` | POST | None | Callback from M-Pesa |
| `/guest-refund-queue-timeout` | POST | None | Timeout callback |

---

**All set! Your guest refund system is ready to use! 🚀**

