-- Add donation_notes field to parents table
ALTER TABLE parents ADD COLUMN IF NOT EXISTS donation_notes TEXT DEFAULT '';
