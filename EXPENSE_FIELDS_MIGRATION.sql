-- Expense-specific fields on transactions: which division the expense
-- belongs to (תלמוד תורה / בית חינוך לבנות), and an attached invoice/receipt file.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS framework    TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_url  TEXT DEFAULT '';
