# 🚀 Guest Refund System - Quick Start

## ✅ What Was Implemented

I've created a complete M-Pesa refund system for guests with:
- ✅ Database table (`mpesa_refunds`)
- ✅ Controller functions (`guestRefund`, `guestRefundResult`)
- ✅ API endpoints (3 new routes)
- ✅ Full callback handling
- ✅ Status tracking (pending → refunded/failed)

---

## 🎯 3 Steps to Get Started

### Step 1: Run the SQL

Open Supabase SQL Editor and run the SQL from `CREATE_MPESA_REFUNDS_TABLE.sql`:

\`\`\`sql
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

-- Indexes (copy all from the file)
CREATE INDEX IF NOT EXISTS idx_mpesa_refunds_guest_id ON mpesa_refunds(guest_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_refunds_originator_conversation_id ON mpesa_refunds(originator_conversation_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_refunds_transaction_id ON mpesa_refunds(transaction_id);
CREATE INDEX IF NOT EXISTS idx_mpesa_refunds_status ON mpesa_refunds(status);
CREATE INDEX IF NOT EXISTS idx_mpesa_refunds_created_at ON mpesa_refunds(created_at DESC);
\`\`\`

### Step 2: Configure URLs (Optional)

Add to `.env` if you want separate callback URLs for refunds:
\`\`\`env
REFUND_RESULT_URL=https://yourdomain.com/api/v1/payment/guest-refund-result
REFUND_QUEUE_TIMEOUT_URL=https://yourdomain.com/api/v1/payment/guest-refund-queue-timeout
\`\`\`

**Note**: If you don't set these, it will use your existing B2C URLs automatically! ✅

### Step 3: Test the Refund

Make a POST request to initiate a refund:

\`\`\`bash
curl -X POST https://your-api.com/api/v1/payment/guest-refund \\
  -H "Content-Type: application/json" \\
  -d '{
    "phoneNumber": "0712345678",
    "amount": 100,
    "guest_id": "your-guest-uuid",
    "remarks": "Test refund"
  }'
\`\`\`

---

## 📊 How to Use

### Initiate Refund (From Your Code)

\`\`\`javascript
const refund = await fetch('/api/v1/payment/guest-refund', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phoneNumber: guest.phone,
    amount: amountToRefund,
    guest_id: guest.id,
    remarks: 'Booking cancellation refund'
  })
});

const result = await refund.json();
console.log('Refund ID:', result.refundId);
\`\`\`

### Check Refund Status (SQL Query)

\`\`\`sql
-- Check a specific refund
SELECT id, amount, status, transaction_receipt, result_desc
FROM mpesa_refunds
WHERE guest_id = 'YOUR_GUEST_UUID'
ORDER BY created_at DESC;
\`\`\`

### Get All Pending Refunds

\`\`\`sql
SELECT * FROM mpesa_refunds 
WHERE status = 'pending'
ORDER BY created_at DESC;
\`\`\`

---

## 🔄 Refund Flow

1. **You call**: `POST /guest-refund` with phone, amount, guest_id
2. **System creates**: Record in `mpesa_refunds` with status = `pending`
3. **M-Pesa processes**: Sends money to guest
4. **M-Pesa calls back**: `POST /guest-refund-result`
5. **System updates**: Status → `refunded` or `failed`
6. **You check**: Query `mpesa_refunds` table for status

---

## 📋 Refund Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Waiting for M-Pesa to process |
| `refunded` | ✅ Successfully refunded to guest |
| `failed` | ❌ M-Pesa rejected the refund |

---

## 🎯 API Endpoints Created

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/payment/guest-refund` | Initiate refund |
| `POST /api/v1/payment/guest-refund-result` | M-Pesa callback |
| `POST /api/v1/payment/guest-refund-queue-timeout` | Timeout callback |

---

## ✨ Key Features

✅ **Auto Status Updates** - Status changes automatically when M-Pesa responds  
✅ **Full Audit Trail** - Every refund attempt is tracked  
✅ **Idempotent** - Safe to retry, won't duplicate refunds  
✅ **Error Handling** - Gracefully handles all M-Pesa errors  
✅ **Easy Queries** - Indexed for fast lookups  
✅ **Uses Existing Setup** - Reuses your B2C credentials and middleware  

---

## 📁 Files Modified/Created

✅ **`db/schema.js`** - Added `mpesa_refunds` table definition  
✅ **`controllers/paymentController.js`** - Added refund functions  
✅ **`routes/payment.js`** - Added refund routes  
✅ **`CREATE_MPESA_REFUNDS_TABLE.sql`** - SQL to run in Supabase  
✅ **`MPESA_REFUNDS_IMPLEMENTATION_GUIDE.md`** - Full documentation  

---

## 🆘 Need Help?

Check `MPESA_REFUNDS_IMPLEMENTATION_GUIDE.md` for:
- Detailed error handling
- Monitoring queries
- Troubleshooting tips
- Example scenarios

---

**That's it! You're ready to refund guests! 🎉**

