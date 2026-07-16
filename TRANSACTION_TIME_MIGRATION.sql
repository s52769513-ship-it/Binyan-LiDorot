-- Add time column to transactions — stores the HH:MM the transaction actually
-- happened at (Israel local time), when the source provides it. Currently
-- only the Nadarim Plus webhook supplies this (TransactionTime); other
-- sources (Airtable pull, manual entry) leave it null.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS time TEXT;
