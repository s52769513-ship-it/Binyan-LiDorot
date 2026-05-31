-- Add pp_type column to planned_payments
-- 'tuition' = שכ"ל (parent owes institution)
-- 'salary'  = משכורת (institution owes employee)

ALTER TABLE planned_payments ADD COLUMN IF NOT EXISTS pp_type TEXT DEFAULT 'tuition';

UPDATE planned_payments SET pp_type = 'salary'  WHERE name = 'משכורת';
UPDATE planned_payments SET pp_type = 'tuition' WHERE name != 'משכורת' OR name IS NULL;
