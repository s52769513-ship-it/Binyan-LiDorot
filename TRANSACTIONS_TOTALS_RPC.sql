-- Accurate income/expense totals across an entire filtered set of
-- transactions, computed in the database instead of client-side.
--
-- The transactions page previously fetched all matching rows' `amount` with
-- a plain SELECT (no pagination) and summed them in JS. That silently broke
-- once the table grew past the project's configured "Max Rows" API setting
-- (commonly 1000): PostgREST truncates any plain row-returning SELECT to
-- that cap regardless of what LIMIT/RANGE the client asks for, so the
-- totals quietly reflected only an arbitrary subset of rows instead of the
-- whole filtered set (this is why a freshly-added expense sometimes didn't
-- move the "הוצאות" total at all). An aggregate function returns exactly
-- one row no matter how many rows it scans, so it isn't subject to that cap.
CREATE OR REPLACE FUNCTION transactions_totals(
  p_parent_ids TEXT[] DEFAULT NULL,
  p_month      TEXT   DEFAULT NULL,
  p_type       TEXT   DEFAULT NULL,
  p_project    TEXT   DEFAULT NULL
)
RETURNS TABLE(total_income NUMERIC, total_expense NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS total_income,
    COALESCE(SUM(amount) FILTER (WHERE amount <= 0), 0) AS total_expense
  FROM transactions
  WHERE (p_parent_ids IS NULL OR parent_ids && p_parent_ids)
    AND (p_month   IS NULL OR month_year = p_month)
    AND (p_type    IS NULL OR type = p_type)
    AND (p_project IS NULL OR p_project = ANY(project_names))
    AND notes NOT LIKE 'זיכוי%'
    -- קופת מזומנים: העברה לאדם שמוחזרת במזומן - לא הכנסה/הוצאה אמיתית,
    -- רק שינוי צורה (יתרת בנק → מזומן ביד). ראו lib/cashFund.ts.
    AND NOT (project_names @> ARRAY['מזומנים']::text[])
$$;
