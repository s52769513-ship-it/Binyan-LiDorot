-- =====================================================
-- Donation credit balance — separate from tuition credit
-- Run in Supabase SQL Editor
-- =====================================================
--
-- credit_balance is used exclusively for שכ"ל (tuition) overpayment credit.
-- Donation (מגבית) overpayment credit was previously mixed into the same
-- column, which meant a donation overpayment could get silently applied to
-- a parent's tuition debt (and vice versa). This gives donation its own
-- column so the two debt types never share credit.

ALTER TABLE parents ADD COLUMN IF NOT EXISTS donation_credit_balance NUMERIC DEFAULT 0;
