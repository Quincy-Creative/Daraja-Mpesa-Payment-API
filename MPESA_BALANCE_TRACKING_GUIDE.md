# M-Pesa Official Balance Tracking Implementation ✅

## Overview
Implemented automatic tracking of M-Pesa account balances with single-row upsert pattern. Every time a balance check callback is received, the database is updated with the latest balances.

---

## 📋 Table Schema

### `official_mpesa_balances`

```sql
CREATE TABLE official_mpesa_balances (
  id SERIAL PRIMARY KEY,
  
  -- Account Balances (KES)
  working_account NUMERIC(14, 2) DEFAULT 0,
  utility_account NUMERIC(14, 2) DEFAULT 0,
  charges_paid_account NUMERIC(14, 2) DEFAULT 0,
  merchant_account NUMERIC(14, 2) DEFAULT 0,
  airtime_purchase_account NUMERIC(14, 2) DEFAULT 0,
  organization_settlement_account NUMERIC(14, 2) DEFAULT 0,
  loan_disbursement_account NUMERIC(14, 2) DEFAULT 0,
  advanced_deduction_account NUMERIC(14, 2) DEFAULT 0,
  savings_deduction_account NUMERIC(14, 2) DEFAULT 0,
  sfc_device_insurance_claims_account NUMERIC(14, 2) DEFAULT 0,
  
  -- Metadata
  currency TEXT DEFAULT 'KES',
  transaction_id TEXT,
  originator_conversation_id TEXT,
  conversation_id TEXT,
  bo_completed_time TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 How It Works

### 1. **Balance Check Request**
When you call the `/b2c-account-balance` endpoint:
- Backend requests current balances from M-Pesa Daraja API
- M-Pesa queues the request and returns acceptance

### 2. **Callback Received**
M-Pesa calls your `B2C_ACCOUNT_BALANCE_RESULTS_URL` with balance data:

```json
{
  "Result": {
    "ResultCode": 0,
    "TransactionID": "TJ90000000",
    "OriginatorConversationID": "...",
    "ConversationID": "...",
    "ResultParameters": {
      "ResultParameter": [
        {
          "Key": "AccountBalance",
          "Value": "Working Account|KES|0.00|...|...&Utility Account|KES|165.00|..."
        },
        {
          "Key": "BOCompletedTime",
          "Value": 20251009231524
        }
      ]
    }
  }
}
```

### 3. **Automatic Parsing & Storage**
The `accountBalanceResult` function:
- ✅ Parses the complex balance string
- ✅ Extracts all 10 account types
- ✅ Maps account names to database columns
- ✅ Parses timestamps
- ✅ Upserts to database (always updates single row)

---

## 📊 Account Types Tracked

| M-Pesa Account Name | Database Column | Purpose |
|---------------------|----------------|---------|
| Working Account | `working_account` | Operational funds |
| **Utility Account** | `utility_account` | **Main transaction account** |
| Charges Paid Account | `charges_paid_account` | M-Pesa charges |
| Merchant Account | `merchant_account` | Merchant services |
| Airtime Purchase Account | `airtime_purchase_account` | Airtime transactions |
| Organization Settlement Account | `organization_settlement_account` | Settlement funds |
| Loan Disbursement Account | `loan_disbursement_account` | Loan services |
| Advanced Deduction Account | `advanced_deduction_account` | Advanced deductions |
| Savings Deduction Account | `savings_deduction_account` | Savings plans |
| SFC Device Insurance Claims | `sfc_device_insurance_claims_account` | Insurance claims |

> **Note**: The **Utility Account** is typically your main operational account where STK push payments are received.

---

## 🚀 Setup Instructions

### Step 1: Create the Table in Supabase

Run the SQL file provided:

```bash
# File: CREATE_OFFICIAL_MPESA_BALANCES_TABLE.sql
```

**In Supabase Dashboard**:
1. Go to SQL Editor
2. Copy contents of `CREATE_OFFICIAL_MPESA_BALANCES_TABLE.sql`
3. Run the SQL
4. Verify table exists in Table Editor

### Step 2: Environment Variables

Ensure these are set in your `.env`:

```bash
# Required for balance check
B2C_ACCOUNT_BALANCE_QUEUE_URL=https://yourdomain.com/api/payments/account-balance-queue-timeout
B2C_ACCOUNT_BALANCE_RESULTS_URL=https://yourdomain.com/api/payments/account-balance-result
```

### Step 3: Test the Flow

1. **Request Balance Check**:
   ```bash
   POST /api/payments/b2c-account-balance
   Headers: Authorization: Bearer <token>
   ```

2. **Wait for Callback**:
   - M-Pesa will call your result URL within 30-60 seconds
   - Check logs for "Account Balance Result received:"

3. **Verify Database**:
   ```sql
   SELECT * FROM official_mpesa_balances;
   ```
   - Should have exactly 1 row
   - All balances populated
   - `updated_at` should be recent

---

## 💻 Querying Balances in Frontend

### Simple Query (All Balances)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getCurrentBalances() {
  const { data, error } = await supabase
    .from('official_mpesa_balances')
    .select('*')
    .single(); // Only one row exists
  
  if (error) {
    console.error('Error fetching balances:', error);
    return null;
  }
  
  return data;
}

// Usage
const balances = await getCurrentBalances();
console.log('Utility Account:', balances.utility_account);
console.log('Working Account:', balances.working_account);
console.log('Last Updated:', balances.updated_at);
```

### Get Specific Accounts

```typescript
async function getMainBalance() {
  const { data, error } = await supabase
    .from('official_mpesa_balances')
    .select('utility_account, working_account, updated_at')
    .single();
  
  return data;
}
```

### React Hook Example

```typescript
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export function useMpesaBalance() {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchBalance() {
      try {
        const { data, error } = await supabase
          .from('official_mpesa_balances')
          .select('*')
          .single();
        
        if (error) throw error;
        setBalance(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchBalance();

    // Optional: Subscribe to real-time updates
    const subscription = supabase
      .channel('balance_updates')
      .on('postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'official_mpesa_balances' 
        },
        (payload) => {
          setBalance(payload.new);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { balance, loading, error };
}

// Usage in component
function BalanceDashboard() {
  const { balance, loading, error } = useMpesaBalance();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h2>M-Pesa Account Balances</h2>
      <p>Utility Account: KES {balance.utility_account}</p>
      <p>Working Account: KES {balance.working_account}</p>
      <p>Last Updated: {new Date(balance.updated_at).toLocaleString()}</p>
    </div>
  );
}
```

---

## 🔒 Row-Level Security (RLS)

If you have RLS enabled on Supabase, add policies:

```sql
-- Allow admins to read balances
CREATE POLICY "Allow admins to read balances"
ON official_mpesa_balances
FOR SELECT
TO authenticated
USING (
  auth.uid() IN (
    SELECT id FROM profiles WHERE role = 'admin'
  )
);

-- Or allow all authenticated users (if needed)
CREATE POLICY "Allow authenticated users to read balances"
ON official_mpesa_balances
FOR SELECT
TO authenticated
USING (true);
```

---

## 📈 Dashboard Display Ideas

### Balance Card Component

```typescript
function BalanceCard({ title, amount, icon }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-500 text-sm">{title}</p>
          <p className="text-2xl font-bold">
            KES {Number(amount).toLocaleString('en-KE', { 
              minimumFractionDigits: 2,
              maximumFractionDigits: 2 
            })}
          </p>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
}

function BalanceOverview() {
  const { balance } = useMpesaBalance();
  
  if (!balance) return null;
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <BalanceCard 
        title="Utility Account (Main)"
        amount={balance.utility_account}
        icon="💰"
      />
      <BalanceCard 
        title="Working Account"
        amount={balance.working_account}
        icon="🏦"
      />
      <BalanceCard 
        title="Charges Paid"
        amount={balance.charges_paid_account}
        icon="💳"
      />
    </div>
  );
}
```

---

## 🔧 Maintenance

### Refresh Balances Manually

Create a button in your admin panel:

```typescript
async function requestBalanceUpdate() {
  try {
    const response = await fetch('/api/payments/b2c-account-balance', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
      alert('Balance update requested. Data will refresh in 30-60 seconds.');
    }
  } catch (error) {
    console.error('Error requesting balance update:', error);
  }
}
```

### Scheduled Balance Checks

Consider adding a cron job to check balances periodically:

```javascript
// In your backend cron service
async function scheduledBalanceCheck() {
  // Run every 6 hours
  const response = await axios.post(
    `${API_URL}/api/payments/b2c-account-balance`,
    {},
    { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } }
  );
  
  console.log('Scheduled balance check initiated:', response.data);
}
```

---

## 📝 Key Implementation Details

### Single Row Pattern
- ✅ Table designed to hold only 1 row
- ✅ First callback inserts new row
- ✅ Subsequent callbacks update existing row
- ✅ Always get latest data with simple `SELECT *`

### Callback Response
```json
{
  "status": "success",
  "accounts": {
    "Working Account": 0,
    "Utility Account": 165,
    "Charges Paid Account": 0,
    ...
  },
  "persisted": true,
  "balances": {
    "working_account": 0,
    "utility_account": 165,
    ...
  }
}
```

### Error Handling
- ✅ Gracefully handles missing data
- ✅ Returns 200 to M-Pesa even if DB write fails
- ✅ Logs all errors for debugging
- ✅ Provides `persisted: false` flag if save failed

---

## ✅ Files Modified

1. **`db/schema.js`**:
   - Added `official_mpesa_balances` table definition
   - Exported in module.exports

2. **`controllers/paymentController.js`**:
   - Imported `official_mpesa_balances`
   - Enhanced `accountBalanceResult` with parsing and upsert logic
   - Added comprehensive account mapping

3. **`CREATE_OFFICIAL_MPESA_BALANCES_TABLE.sql`**:
   - Complete SQL for Supabase table creation
   - Includes helpful column comments

---

## 🎯 Testing Checklist

- [ ] Run SQL to create table in Supabase
- [ ] Request balance check via `/b2c-account-balance`
- [ ] Verify callback received (check logs)
- [ ] Query table - should have 1 row with balances
- [ ] Request balance check again
- [ ] Verify row updated (not duplicated)
- [ ] Test frontend query
- [ ] Verify timestamps update correctly

---

## 🚨 Important Notes

1. **Single Row**: This table is designed to always have exactly 1 row
2. **Main Account**: The `utility_account` is typically where STK push payments land
3. **Real-time Updates**: Consider using Supabase realtime subscriptions for live balance updates
4. **Permissions**: Ensure only admins can trigger balance checks
5. **Rate Limiting**: Don't spam balance check requests (M-Pesa may rate limit)

---

**Status**: Complete ✅  
**Linter Errors**: 0  
**Date**: October 9, 2025

