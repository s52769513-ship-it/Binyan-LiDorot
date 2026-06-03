-- Standing orders table: multiple standing orders per parent
CREATE TABLE IF NOT EXISTS standing_orders (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id          UUID        NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  external_id        TEXT        NOT NULL DEFAULT '', -- הו"ק ID from Nadraim
  standing_order_type TEXT       DEFAULT '',
  bank_name          TEXT        DEFAULT '',
  bank_branch        TEXT        DEFAULT '',
  bank_account       TEXT        DEFAULT '',
  charge_day         INTEGER,
  linked_parent_id   UUID        REFERENCES parents(id) ON DELETE SET NULL, -- whose payments this covers
  notes              TEXT        DEFAULT '',
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS standing_orders_parent_id_idx  ON standing_orders(parent_id);
CREATE INDEX IF NOT EXISTS standing_orders_external_id_idx ON standing_orders(external_id);

-- Add standing_order_id to transactions (links transaction to a standing order record)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS standing_order_id UUID REFERENCES standing_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_standing_order_id_idx ON transactions(standing_order_id);
