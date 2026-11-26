BEGIN;
ALTER TABLE public.dbk36_wa_cart_items ADD COLUMN IF NOT EXISTS variant_id text NOT NULL DEFAULT '';
ALTER TABLE public.dbk155_wa_shortlists ADD COLUMN IF NOT EXISTS pending_variant_product_id text;
ALTER TABLE public.dbk155_wa_shortlists ADD COLUMN IF NOT EXISTS pending_variant_quantity integer;
ALTER TABLE public.dbk155_wa_shortlists ADD COLUMN IF NOT EXISTS pending_variant_ids jsonb;
COMMIT;
