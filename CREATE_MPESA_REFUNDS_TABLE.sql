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

