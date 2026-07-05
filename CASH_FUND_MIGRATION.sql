-- קופת מזומנים: ledger נפרד לגמרי מ-transactions, כדי שדבר שקורה בו לעולם לא
-- ישפיע על שום דשבורד קיים. amount חתום: חיובי = הופקד לקופה, שלילי = נמשך.
CREATE TABLE IF NOT EXISTS cash_fund_entries (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  amount                NUMERIC     NOT NULL,
  date                  DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes                 TEXT        DEFAULT '',
  source_transaction_id TEXT,                    -- תנועת המקור שרשומה זו משכפלת, אם יש
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_fund_source_tx ON cash_fund_entries (source_transaction_id);
CREATE INDEX IF NOT EXISTS idx_cash_fund_date       ON cash_fund_entries (date);

-- מונע שכפול כפול של אותה תנועה ברמת ה-DB (הגנה נוספת מעבר לבדיקה ב-API).
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_fund_source_tx_unique
  ON cash_fund_entries (source_transaction_id)
  WHERE source_transaction_id IS NOT NULL;

ALTER TABLE cash_fund_entries DISABLE ROW LEVEL SECURITY;

-- יתרה עדכנית מחושבת בתוך הדאטהבייס (לא SELECT-וסיכום בצד לקוח) - כמו
-- transactions_totals() ב-TRANSACTIONS_TOTALS_RPC.sql, מאותה סיבה בדיוק:
-- PostgREST חותך תוצאות SELECT רגילות במגבלת שורות, אבל פונקציית aggregate
-- תמיד מחזירה שורה אחת בלי קשר לכמות השורות שנסרקו.
CREATE OR REPLACE FUNCTION cash_fund_balance()
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(amount), 0) FROM cash_fund_entries
$$;
