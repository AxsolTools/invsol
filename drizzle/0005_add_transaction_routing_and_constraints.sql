-- Migration: Add transaction_routing table and UNIQUE constraints
-- Run this in your PostgreSQL database

-- Add UNIQUE constraint on transactions.txSignature (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'transactions_txsignature_unique'
  ) THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_txsignature_unique UNIQUE ("txSignature");
  END IF;
END $$;

-- Create transaction_routing table for storing transaction ID mappings
CREATE TABLE IF NOT EXISTS transaction_routing (
  id SERIAL PRIMARY KEY,
  "txSignature" VARCHAR(128) NOT NULL UNIQUE,
  "routingTransactionId" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transaction_routing_txsignature ON transaction_routing("txSignature");
CREATE INDEX IF NOT EXISTS idx_transaction_routing_routingid ON transaction_routing("routingTransactionId");

-- Migrate existing data from memory (this won't do anything on first run, but safe to run)
-- If you have existing transaction mappings, you'll need to handle them separately

