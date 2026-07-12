-- טבלת אשפה מרכזית: שמירה על כל הרשומות שנמחקו לתקופה של 30 ימים
-- לכל רשומה שנמחקת (transaction, planned_payment, child, וכו') נשמרים כל הנתונים כ-JSONB
-- כדי שניתן יהיה להחזיר אם צריך.
CREATE TABLE IF NOT EXISTS deleted_records (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type         TEXT        NOT NULL,  -- 'transaction', 'planned_payment', 'child', 'parent', וכו'
  record_id           TEXT        NOT NULL,  -- ID של הרשומה המקורית
  deleted_by          TEXT        NOT NULL,  -- auth_email - מי מחק
  deleted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  restore_deadline    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  data                JSONB       NOT NULL,  -- כל הנתונים של הרשומה המקורית
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- אינדקסים
CREATE INDEX IF NOT EXISTS idx_deleted_records_type
  ON deleted_records (record_type);

CREATE INDEX IF NOT EXISTS idx_deleted_records_record_id
  ON deleted_records (record_id);

CREATE INDEX IF NOT EXISTS idx_deleted_records_restore_deadline
  ON deleted_records (restore_deadline);

-- מניעת רשומה כפולה לאותו פריט
CREATE UNIQUE INDEX IF NOT EXISTS idx_deleted_records_type_record_id_unique
  ON deleted_records (record_type, record_id);

ALTER TABLE deleted_records DISABLE ROW LEVEL SECURITY;
