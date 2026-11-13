-- DBK-36 Phase 2. Additive, no changes to orders, payments, inventory or POS.
-- Apply to a disposable Neon branch first; confirm backup/production identity before production.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk36_wa_carts (
  wa_id TEXT PRIMARY KEY REFERENCES public.dbk36_wa_conversations(wa_id) ON DELETE CASCADE,
  last_viewed_product_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS public.dbk36_wa_cart_items (
  wa_id TEXT NOT NULL REFERENCES public.dbk36_wa_carts(wa_id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  quantity INT NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (wa_id, product_id)
);
-- Idempotency for cart mutations when the same inbound Meta message is retried.
CREATE TABLE IF NOT EXISTS public.dbk36_wa_cart_actions (
  inbound_message_id UUID PRIMARY KEY REFERENCES public.dbk36_wa_messages(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL REFERENCES public.dbk36_wa_carts(wa_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('add','remove','quantity','clear')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dbk36_wa_cart_items_updated_idx
  ON public.dbk36_wa_cart_items (updated_at DESC);
COMMIT;
