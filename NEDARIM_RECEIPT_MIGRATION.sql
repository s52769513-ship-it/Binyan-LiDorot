-- ריצה ידנית ב-Supabase SQL Editor.
--
-- קבלות נדרים על תשלומים שנרשמו רק אצלנו (מזומן / צ'ק / העברה).
-- התהליך הוא שרשרת של שתי פעולות אצל נדרים:
--   1. יצירת "הכנסה חיצונית" (SaveAchnasot) — נדרים מחזירים מזהה.
--   2. הפקת קבלה על אותו מזהה (CreateInvoice).
--
-- שלוש העמודות כאן שומרות את התוצאה כדי שלא ניצור את אותה הכנסה פעמיים:
-- nedarim_income_id נשמר *מיד* אחרי שלב 1, עוד לפני הפקת הקבלה, כך שגם אם
-- שלב 2 נכשל — ניסיון חוזר יפיק קבלה על ההכנסה הקיימת ולא ייצור הכנסה כפולה.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS nedarim_income_id  text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS nedarim_receipt_id text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS nedarim_receipt_at timestamptz;

-- לאיתור מהיר של תנועות שכבר נשלחו לנדרים (ולמניעת כפילות).
CREATE INDEX IF NOT EXISTS idx_transactions_nedarim_income
  ON transactions (nedarim_income_id)
  WHERE nedarim_income_id IS NOT NULL;
