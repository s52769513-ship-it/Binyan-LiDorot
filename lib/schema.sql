-- =====================================================
-- Binyan LiDorot – Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL)
-- =====================================================

-- 1. הורים (אנ"ש)
CREATE TABLE IF NOT EXISTS parents (
  id              TEXT PRIMARY KEY,           -- Airtable record ID
  name            TEXT,                       -- שם מלא (נוסחה)
  first_name      TEXT,
  last_name       TEXT,
  mother_name     TEXT,
  father_phone    TEXT,
  mother_phone    TEXT,
  email           TEXT,
  address         TEXT,
  building        TEXT,
  city            TEXT,
  status          TEXT[]   DEFAULT '{}',
  children_count  INTEGER  DEFAULT 0,
  tuition_total   NUMERIC  DEFAULT 0,         -- סה"כ שכ"ל לתשלום
  tuition_balance NUMERIC  DEFAULT 0,         -- חוב / זכות שכ"ל
  notes           TEXT,
  synced_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 2. תלמידים
CREATE TABLE IF NOT EXISTS students (
  id                  TEXT PRIMARY KEY,
  parent_ids          TEXT[]  DEFAULT '{}',   -- מזהי הורים מקושרים
  name                TEXT,
  gender              TEXT,
  age                 TEXT,
  class_name          TEXT,
  status              TEXT,
  transportation      TEXT[]  DEFAULT '{}',
  transportation_cost NUMERIC DEFAULT 0,
  synced_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 3. תנועות כספיות
CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,
  parent_ids    TEXT[]  DEFAULT '{}',
  amount        NUMERIC DEFAULT 0,
  type          TEXT,
  date          DATE,
  month_year    TEXT,
  notes         TEXT,
  project_ids   TEXT[]  DEFAULT '{}',   -- מזהי פרוייקטים מ-Airtable
  project_names TEXT[]  DEFAULT '{}',   -- שמות פרוייקטים (כגון "בנין לדורות")
  synced_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Migration (run if table already exists):
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS project_ids   TEXT[] DEFAULT '{}';
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS project_names TEXT[] DEFAULT '{}';

-- 4. חובות
CREATE TABLE IF NOT EXISTS debts (
  id           TEXT PRIMARY KEY,
  parent_ids   TEXT[]  DEFAULT '{}',
  amount       NUMERIC DEFAULT 0,
  created_time TIMESTAMPTZ,
  synced_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 5. תשלומים מתוכננים
CREATE TABLE IF NOT EXISTS planned_payments (
  id         TEXT PRIMARY KEY,
  parent_ids TEXT[]  DEFAULT '{}',
  name       TEXT,
  amount     NUMERIC DEFAULT 0,
  date       DATE,
  month_year TEXT,
  balance    NUMERIC DEFAULT 0,
  synced_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 6. חלוקת תשלומים לתלמידים (בנין לדורות)
CREATE TABLE IF NOT EXISTS payment_allocations (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT    NOT NULL,
  student_id     TEXT    NOT NULL,
  parent_id      TEXT    NOT NULL,
  amount         NUMERIC NOT NULL DEFAULT 0,
  month_year     TEXT,
  synced_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alloc_transaction ON payment_allocations (transaction_id);
CREATE INDEX IF NOT EXISTS idx_alloc_student     ON payment_allocations (student_id);
CREATE INDEX IF NOT EXISTS idx_alloc_parent      ON payment_allocations (parent_id);
CREATE INDEX IF NOT EXISTS idx_alloc_month       ON payment_allocations (month_year);

-- 7. לוג סנכרון
CREATE TABLE IF NOT EXISTS sync_log (
  id                    SERIAL PRIMARY KEY,
  synced_at             TIMESTAMPTZ DEFAULT NOW(),
  parents_count         INTEGER DEFAULT 0,
  students_count        INTEGER DEFAULT 0,
  transactions_count    INTEGER DEFAULT 0,
  debts_count           INTEGER DEFAULT 0,
  planned_payments_count INTEGER DEFAULT 0,
  status                TEXT,
  error                 TEXT
);

-- =====================================================
-- Indexes for common query patterns
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_students_parent_ids    ON students    USING GIN (parent_ids);
CREATE INDEX IF NOT EXISTS idx_transactions_parent_ids ON transactions USING GIN (parent_ids);
CREATE INDEX IF NOT EXISTS idx_transactions_month_year ON transactions (month_year);
CREATE INDEX IF NOT EXISTS idx_debts_parent_ids        ON debts        USING GIN (parent_ids);
CREATE INDEX IF NOT EXISTS idx_planned_parent_ids      ON planned_payments USING GIN (parent_ids);
CREATE INDEX IF NOT EXISTS idx_parents_last_name       ON parents (last_name);

-- =====================================================
-- Disable RLS for internal admin use
-- (remove these lines if you add auth later)
-- =====================================================
ALTER TABLE parents               DISABLE ROW LEVEL SECURITY;
ALTER TABLE students              DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions          DISABLE ROW LEVEL SECURITY;
ALTER TABLE debts                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE planned_payments      DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations   DISABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log              DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- Helper: delete stale rows after sync
-- Run this in Supabase SQL Editor if prune fails.
-- =====================================================
CREATE OR REPLACE FUNCTION prune_stale_rows(p_table text, p_synced_at text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format('DELETE FROM %I WHERE synced_at < $1::timestamptz', p_table)
  USING p_synced_at;
END;
$$;
