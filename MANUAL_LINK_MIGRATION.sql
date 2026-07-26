-- ריצה ידנית ב-Supabase SQL Editor.
-- מוסיף דגל "קישור ידני" לתנועות: תנועה שהמשתמש קישר/ניתק ידנית מ-PP.
-- כשהדגל דלוק, הריענון (relinkParent) לא נוגע בקישור שלה — לא מקשר מחדש
-- ולא מנתק — כך שקישורים ידניים (כולל ל-PP מלפני 04/2026) שורדים ריענון.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS manual_link boolean DEFAULT false;
