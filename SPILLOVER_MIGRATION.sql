-- Migration: Add source_transaction_id to transactions
-- Run this in the Supabase SQL Editor (Dashboard > SQL)
--
-- שורות "זיכוי מעודף תשלום" (גלישת עודף מ-PP אחד לאחר) נושאות הפניה
-- לתנועת המקור — כך שפירוט תנועה יכול להציג בדיוק מה התשלום כיסה.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_transaction_id TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_source_tx ON transactions(source_transaction_id);
