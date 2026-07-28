-- ריצה ידנית ב-Supabase SQL Editor.
-- מוסיף לתלמידים שדה "מאושר ע"י הוועד". תלמיד יוצא מרשימת הנרשמים רק כשהוא גם
-- מאושר וגם הסטטוס שלו אינו "ממתין".
ALTER TABLE students ADD COLUMN IF NOT EXISTS committee_approved boolean DEFAULT false;

-- כל מי שאינו "ממתין" נחשב מאושר, כדי שלשונית "נרשמים" תציג רק נרשמים חדשים
-- ולא את כל תלמידי המוסד.
UPDATE students SET committee_approved = true WHERE status IS DISTINCT FROM 'ממתין';
