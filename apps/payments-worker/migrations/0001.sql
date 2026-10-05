CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  idempotency_hash TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  read_token_hash TEXT NOT NULL,
  amount_minor TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  intention TEXT NOT NULL,
  locale TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  recipient_raw TEXT NOT NULL,
  amount_nano_ton TEXT NOT NULL,
  charity_quarter_nano_ton TEXT NOT NULL,
  comment TEXT NOT NULL UNIQUE,
  quote_usd TEXT NOT NULL,
  quoted_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  transaction_hash TEXT UNIQUE,
  confirmed_at INTEGER,
  CHECK (charity_quarter_nano_ton = amount_nano_ton)
);
CREATE INDEX IF NOT EXISTS payment_orders_pending ON payment_orders(status, created_at);
CREATE TABLE IF NOT EXISTS payment_service_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
