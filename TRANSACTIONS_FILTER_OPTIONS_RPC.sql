-- ערכי הסינון (חודשים / אמצעים / קטגוריות) בעמוד "תנועות" חושבו עד כה ע"י
-- SELECT רגיל של העמודה וסינון distinct בצד לקוח. אבל PostgREST חותך כל SELECT
-- רגיל במגבלת השורות של הפרויקט (בד"כ 1000), כך שערך שמופיע רק בתנועות מעבר
-- למדגם הזה (למשל אמצעי תשלום "אשראי" שכל התנועות שלו ישנות) פשוט לא הופיע
-- כאופציה בסינון. פונקציית aggregate מחזירה תמיד שורה אחת בלי קשר לכמות
-- השורות שנסרקו - בדיוק כמו transactions_totals() (TRANSACTIONS_TOTALS_RPC.sql).
CREATE OR REPLACE FUNCTION transactions_filter_options()
RETURNS TABLE(months TEXT[], types TEXT[], projects TEXT[])
LANGUAGE sql
STABLE
AS $$
  SELECT
    ARRAY(
      SELECT DISTINCT month_year FROM transactions
      WHERE month_year IS NOT NULL AND month_year <> ''
    ),
    ARRAY(
      SELECT DISTINCT type FROM transactions
      WHERE type IS NOT NULL AND type <> ''
    ),
    ARRAY(
      SELECT DISTINCT unnest(project_names) FROM transactions
      WHERE project_names IS NOT NULL
    )
$$;
