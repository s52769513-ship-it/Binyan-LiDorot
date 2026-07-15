-- =====================================================
-- Credit balance columns on parents
-- Run in Supabase SQL Editor
-- =====================================================
--
-- credit_balance          — tuition (שכ"ל) overpayment credit.
-- donation_credit_balance — donation (מגבית) overpayment credit, kept
--                           separate so the two debt types never share credit.
--
-- NOTE: credit_balance was referenced by the app for a long time but was
-- never actually added by a migration, so writes to it failed silently
-- (they run fire-and-forget) and stored credit never persisted. Adding it
-- here fixes that. IF NOT EXISTS makes this safe to run repeatedly.

ALTER TABLE parents ADD COLUMN IF NOT EXISTS credit_balance          NUMERIC DEFAULT 0;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS donation_credit_balance NUMERIC DEFAULT 0;

-- Make PostgREST pick up the new columns immediately (otherwise the API
-- keeps returning "Could not find the 'X' column ... in the schema cache").
NOTIFY pgrst, 'reload schema';
