-- Migration: Support for specific-date automation scheduling
-- Automations can be scheduled for specific calendar dates, not just recurring day-of-month.

CREATE TABLE IF NOT EXISTS automation_specific_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  hour INTEGER NOT NULL DEFAULT 8,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(automation_id, scheduled_date)
);

CREATE INDEX IF NOT EXISTS idx_automation_specific_dates_auto_id ON automation_specific_dates(automation_id);
CREATE INDEX IF NOT EXISTS idx_automation_specific_dates_date ON automation_specific_dates(scheduled_date);

ALTER TABLE automation_specific_dates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON automation_specific_dates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
