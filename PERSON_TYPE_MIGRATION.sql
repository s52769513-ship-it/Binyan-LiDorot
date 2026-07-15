-- =====================================================
-- סוג בן אדם (person type) — multi-select, creatable
-- Run in Supabase SQL Editor
-- =====================================================
--
-- אנ"ש / ספק / כל ערך מותאם שהמשתמש יוצר. מערך (בחירה מרובה), על משקל status.
-- האפשרויות בתפריט נגזרות מהערכים הקיימים ב-DB (ראה /api/parents/types).

ALTER TABLE parents ADD COLUMN IF NOT EXISTS person_type TEXT[] DEFAULT '{}';
