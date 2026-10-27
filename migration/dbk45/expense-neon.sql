-- DBK-45: Additive only; does not modify Sanity or current inventory/stock tables.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk_expense_records (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  payload_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  expense_date TIMESTAMPTZ NOT NULL,
  store_location_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT dbk_expense_json_type CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT dbk_expense_id_matches CHECK (payload->>'id' = id)
);
CREATE INDEX IF NOT EXISTS dbk_expenses_by_date ON public.dbk_expense_records (expense_date DESC);
CREATE INDEX IF NOT EXISTS dbk_expenses_by_store ON public.dbk_expense_records (store_location_id, expense_date DESC);
COMMENT ON TABLE public.dbk_expense_records IS 'Neon-only expenditure with immutable idempotency keys; Sanity historical expenses retained';
COMMIT;
