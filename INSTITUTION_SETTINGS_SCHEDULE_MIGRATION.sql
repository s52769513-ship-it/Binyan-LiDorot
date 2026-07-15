-- Migration: Add per-automation schedule columns to institution_settings
-- These columns are read/written by app/api/settings/route.ts (PATCH) and
-- by lib/automationSchedule.ts (readConfig) but were never added to the
-- actual Supabase table — causing "Could not find the 'X' column ... in
-- the schema cache" errors when saving a schedule from the UI.

CREATE TABLE IF NOT EXISTS institution_settings (
  id INTEGER PRIMARY KEY DEFAULT 1
);

ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS institution_name TEXT;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS primary_color TEXT;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS automation_day INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS automation_hour INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN DEFAULT true;

ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS tuition_offset_day INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS tuition_offset_hour INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS tuition_offset_time TEXT;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS tuition_offset_enabled BOOLEAN DEFAULT true;

ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS credit_offset_day INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS credit_offset_hour INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS credit_offset_time TEXT;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS credit_offset_enabled BOOLEAN DEFAULT true;

ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS salary_pp_day INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS salary_pp_hour INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS salary_pp_time TEXT;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS salary_pp_enabled BOOLEAN DEFAULT true;

ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS donation_pp_day INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS donation_pp_hour INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS donation_pp_time TEXT;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS donation_pp_enabled BOOLEAN DEFAULT true;

ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS donation_offset_day INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS donation_offset_hour INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS donation_offset_time TEXT;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS donation_offset_enabled BOOLEAN DEFAULT true;

ALTER TABLE institution_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON institution_settings;
CREATE POLICY "service_role_all" ON institution_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Ensure the single settings row exists so PATCH's upsert(id=1) always has
-- a row to update.
INSERT INTO institution_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
