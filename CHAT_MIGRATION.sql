-- Chat messages table for internal communication
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_email TEXT NOT NULL,
  from_role TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_by TEXT[] DEFAULT '{}'
);

-- Index for ordering by created_at
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages (created_at ASC);

-- Enable Row Level Security (optional - since we use service role)
-- ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
