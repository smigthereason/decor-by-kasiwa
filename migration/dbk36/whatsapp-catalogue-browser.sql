-- DBK-36C: ADDITIVE migration. Reviewed additive source; apply only to pinned MAIN Neon with v23 approval.
-- Does not touch products, orders, inventory, payments or Sanity documents.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk36_wa_catalogue_cache (
  cache_key TEXT PRIMARY KEY CHECK (cache_key='ecommerce'),
  products_json JSONB NOT NULL CHECK (jsonb_typeof(products_json)='array'),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.dbk36_wa_browse_states (
  wa_id TEXT PRIMARY KEY REFERENCES public.dbk36_wa_conversations(wa_id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('categories','products')),
  category TEXT,
  query TEXT,
  page INT NOT NULL DEFAULT 0 CHECK (page >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dbk36_wa_browse_states_updated_idx
 ON public.dbk36_wa_browse_states (updated_at);
COMMIT;
