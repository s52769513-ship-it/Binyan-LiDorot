-- =====================================================
-- Donation (דמי מגבית) Migration
-- Run in Supabase SQL Editor
-- =====================================================

-- 1. Add monthly_donation to parents
ALTER TABLE parents ADD COLUMN IF NOT EXISTS monthly_donation NUMERIC DEFAULT 0;

-- Index for quick donor lookups
CREATE INDEX IF NOT EXISTS idx_parents_monthly_donation
  ON parents (monthly_donation) WHERE monthly_donation > 0;

-- 2. Ensure standing_orders has project_name and charge_amount
-- (these may already exist — safe to run regardless)
ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS project_name  TEXT    DEFAULT '';
ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS charge_amount NUMERIC;
ALTER TABLE standing_orders ADD COLUMN IF NOT EXISTS so_status     TEXT    DEFAULT 'פעיל';

-- Index for filtering donation standing orders
CREATE INDEX IF NOT EXISTS idx_so_project_name
  ON standing_orders (project_name) WHERE project_name = 'דמי מגבית';

-- 3. planned_payments pp_type already supports any text value;
-- 'donation' is the new value for donation PPs. No schema change needed.
-- Make sure the pp_type column exists (added in PP_TYPE_MIGRATION.sql):
ALTER TABLE planned_payments ADD COLUMN IF NOT EXISTS pp_type TEXT DEFAULT 'tuition';
