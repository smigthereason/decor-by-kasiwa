-- Apply to the pinned main Neon database before deploying DBK178.
-- Additive only; existing paid and uncertain payment records remain unchanged.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.dbk36_wa_prod_payment_orders') IS NULL OR
    to_regclass('public.dbk36_wa_prod_callback_inbox') IS NULL OR
    to_regclass('public.dbk36_wa_paid_intake') IS NULL OR
    to_regprocedure('public.dbk36_wa_prod_finalize_paid(text,text,text,text,text,integer,timestamptz)') IS NULL THEN
   RAISE EXCEPTION 'DBK178_PRODUCTION_SCHEMA_REQUIRED';
 END IF;
END $$;
ALTER TABLE public.dbk36_wa_prod_payment_orders ADD COLUMN IF NOT EXISTS payer_phone text;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.dbk36_wa_prod_payment_orders'::regclass AND conname='dbk178_payer_phone_format') THEN
   ALTER TABLE public.dbk36_wa_prod_payment_orders ADD CONSTRAINT dbk178_payer_phone_format CHECK (payer_phone IS NULL OR payer_phone ~ '^254[17][0-9]{8}$');
 END IF;
END $$;
-- A number with a pending or uncertain WhatsApp STK cannot receive a second one.
CREATE UNIQUE INDEX IF NOT EXISTS dbk178_active_per_payer ON public.dbk36_wa_prod_payment_orders ((coalesce(payer_phone,wa_id))) WHERE status IN ('starting','prompt_sent','review_required');
CREATE INDEX IF NOT EXISTS dbk178_payer_recent ON public.dbk36_wa_prod_payment_orders ((coalesce(payer_phone,wa_id)),updated_at DESC) WHERE status IN ('starting','prompt_sent','review_required','paid','failed');
COMMIT;
