-- ── יומן פעולות (Activity log) ────────────────────────────────────────────
-- תיעוד כל פעולה שנעשתה על רשומת הורה: מי עשה אותה, מתי, ומה בדיוק קרה.
-- כתיבה בלבד מהצד השרת (best-effort — אף פעם לא מפילה פעולה אמיתית אם נכשלה).

CREATE TABLE IF NOT EXISTS activity_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  TEXT,                -- ההורה שהפעולה משויכת אליו
  actor      TEXT,                -- מייל המשתמש, או 'מערכת (אוטומציה)' לפעולה אוטומטית
  action     TEXT,                -- קטגוריה קצרה: update / create / delete / automation
  summary    TEXT,                -- תיאור קריא בעברית
  details    JSONB,               -- נתונים גולמיים אופציונליים (לפני/אחרי וכו')
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_parent ON activity_log (parent_id, created_at DESC);

ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
