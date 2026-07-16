-- ── תשלומים קבועים (Recurring supplier payments) ─────────────────────────────
-- מנגנון לניהול חיובים חוזרים לספקים (בזק, ועד בית, חשמל…). כל ספק הוא רשומת
-- parent המתויגת person_type הכולל 'ספק'. בכל תחילת חודש נוצרות שורות "הרצה"
-- (recurring_payment_runs) לכל הגדרה פעילה; סימון "שולם" יוצר תנועת הוצאה אמיתית.
-- אשראי מטופל בנפרד דרך משימת "לשלם לבעל הכרטיס" (card_payment_tasks).

-- 1. הגדרות הספקים (שורות הטבלה שהמשתמש מנהל)
CREATE TABLE IF NOT EXISTS recurring_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id      TEXT,                       -- קישור ל-parents (הספק)
  supplier_name  TEXT,                       -- cache לשם לתצוגה
  amount         NUMERIC DEFAULT 0,          -- סכום החיוב החודשי
  charge_day     INTEGER,                    -- יום בחודש (1-31); NULL → ה-1 לחודש
  payment_method TEXT,                       -- אשראי / הו"ק / העברה / מזומן / אחר
  bank           TEXT,                       -- חשבון/כרטיס שדרכו מחייבים (למשל אורחות)
  active         BOOLEAN DEFAULT true,       -- לא פעיל → לא נוצרת הרצה
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 2. הרצות חודשיות = המשימות (שורה אחת לכל הגדרה בכל חודש)
CREATE TABLE IF NOT EXISTS recurring_payment_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurring_payment_id UUID,
  parent_id            TEXT,
  supplier_name        TEXT,
  month_year           TEXT,                 -- "MM/YYYY"
  due_date             DATE,                 -- יום החיוב בחודש הנוכחי
  amount_due           NUMERIC DEFAULT 0,    -- סכום שצריך לשלם
  amount_paid          NUMERIC DEFAULT 0,    -- סכום ששולם בפועל
  payment_method       TEXT,                 -- snapshot מההגדרה
  bank                 TEXT,                 -- snapshot מההגדרה
  status               TEXT DEFAULT 'open',  -- 'open' | 'done'
  transaction_id       TEXT,                 -- תנועת ההוצאה שנוצרה (NULL באשראי)
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
-- הרצה אחת לכל (הגדרה, חודש) — מונע כפילויות בהרצות אוטומציה חוזרות
CREATE UNIQUE INDEX IF NOT EXISTS idx_rpr_unique
  ON recurring_payment_runs (recurring_payment_id, month_year);
CREATE INDEX IF NOT EXISTS idx_rpr_month ON recurring_payment_runs (month_year);

-- 3. משימת "לשלם לבעל הכרטיס" (שורה אחת לחודש; הסכום מחושב live מהרצות האשראי)
CREATE TABLE IF NOT EXISTS card_payment_tasks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_year           TEXT,
  card_owner_parent_id TEXT,                 -- למי משלמים (נבחר בעת הסימון / ברירת מחדל)
  status               TEXT DEFAULT 'open',  -- 'open' | 'done'
  transaction_id       TEXT,                 -- התנועה המרוכזת שנוצרה
  created_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cpt_month ON card_payment_tasks (month_year);

-- 4. עמודות שיבוץ ל-institution_settings (בהתאם לקונבנציית settingsKey)
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS recurring_payments_day     INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS recurring_payments_hour    INTEGER;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS recurring_payments_time    TEXT;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS recurring_payments_enabled BOOLEAN;
ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS card_owner_parent_id       TEXT;

-- RLS off, בהתאם לשאר המערכת
ALTER TABLE recurring_payments      DISABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_payment_runs  DISABLE ROW LEVEL SECURITY;
ALTER TABLE card_payment_tasks      DISABLE ROW LEVEL SECURITY;

-- רענון schema cache של PostgREST
NOTIFY pgrst, 'reload schema';
