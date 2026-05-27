-- Salary migration: add salary fields to parents and women tables
-- Run this in Supabase SQL editor

-- ── parents table additions ─────────────────────────────────────────────────
ALTER TABLE parents
  ADD COLUMN IF NOT EXISTS base_hourly_rate       numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seniority_bonus_hourly numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_hours_decimal  numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_bonus            numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exceptional_expenses   numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_reimbursement numeric  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_spouse_salary     boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS calculate_wife_tuition boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS salary_gross           numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS woman_ids              text[]    DEFAULT '{}';

-- ── women table additions ────────────────────────────────────────────────────
ALTER TABLE women
  ADD COLUMN IF NOT EXISTS base_hourly_rate       numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_hours_decimal  numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fixed_bonus            numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exceptional_expenses   numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS salary_gross           numeric   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status                 text      DEFAULT '',
  ADD COLUMN IF NOT EXISTS role                   text[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_fixed_salary        boolean   DEFAULT false;
