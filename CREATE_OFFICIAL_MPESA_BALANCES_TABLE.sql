-- Create official_mpesa_balances table
-- This table stores the current M-Pesa account balances
-- It should only contain ONE row that gets updated on each balance query

CREATE TABLE IF NOT EXISTS official_mpesa_balances (
  id SERIAL PRIMARY KEY,
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
  currency TEXT DEFAULT 'KES',
  transaction_id TEXT,
  originator_conversation_id TEXT,
  conversation_id TEXT,
  bo_completed_time TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add comment to clarify usage
COMMENT ON TABLE official_mpesa_balances IS 'Stores current M-Pesa account balances. Should only contain one row that gets updated on each balance check callback.';

-- Add helpful comments on key columns
COMMENT ON COLUMN official_mpesa_balances.working_account IS 'Working Account balance in KES';
COMMENT ON COLUMN official_mpesa_balances.utility_account IS 'Utility Account balance in KES (main account for transactions)';
COMMENT ON COLUMN official_mpesa_balances.bo_completed_time IS 'Backend office completion timestamp from M-Pesa';

