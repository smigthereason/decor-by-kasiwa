-- DBK-36 v23. Main PRODUCTION Neon ONLY. Additive order, callback and audit ledger.
-- Do not apply to staging Neon. Does not touch DBK51/55/56/62/69 or inventory rows.
BEGIN;
DO $pre$ BEGIN
 IF to_regclass('public.dbk36_wa_paid_intake') IS NULL OR
    to_regclass('public.dbk36_wa_stock_fulfillment') IS NULL OR
    to_regclass('public.dbk36_wa_paid_intake_config') IS NULL THEN
   RAISE EXCEPTION 'DBK36_V21_MAIN_PRODUCTION_SCHEMA_REQUIRED'; END IF;
 IF (SELECT count(*) FROM public.dbk36_wa_paid_intake_config WHERE singleton AND enabled)<>1 THEN
   RAISE EXCEPTION 'DBK36_MAIN_INTAKE_GATE_REQUIRED'; END IF;
END $pre$;
CREATE TABLE IF NOT EXISTS public.dbk36_wa_prod_payment_orders(
 reference text PRIMARY KEY CHECK(reference~'^DBKWA[A-Z0-9]{7}$'),
 wa_id text NOT NULL CHECK(wa_id~'^254(7|1)[0-9]{8}$'),
 amount_kes integer NOT NULL CHECK(amount_kes BETWEEN 1 AND 500),
 cart_snapshot jsonb NOT NULL CHECK(jsonb_typeof(cart_snapshot)='array' AND jsonb_array_length(cart_snapshot) BETWEEN 1 AND 12),
 fulfillment_mode text NOT NULL DEFAULT 'pickup' CHECK(fulfillment_mode='pickup'),
 status text NOT NULL DEFAULT 'quoted' CHECK(status IN ('quoted','starting','prompt_sent','paid','failed','review_required','cancelled')),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '10 minutes'),
 pickup_confirmed_at timestamptz,
 checkout_id text UNIQUE,
 merchant_id text,
 receipt text UNIQUE,
 provider_transaction_at timestamptz,
 paid_at timestamptz,
 stock_state text NOT NULL DEFAULT 'PENDING' CHECK(stock_state IN ('PENDING','COMMITTED','REVIEW_REQUIRED')),
 last_error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'paid' OR (checkout_id IS NOT NULL AND merchant_id IS NOT NULL AND
                             receipt IS NOT NULL AND paid_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS dbk36_prod_active_per_sender
 ON public.dbk36_wa_prod_payment_orders(wa_id)
 WHERE status IN ('quoted','starting','prompt_sent','review_required');
CREATE INDEX IF NOT EXISTS dbk36_prod_recover ON public.dbk36_wa_prod_payment_orders(status,updated_at)
 WHERE status IN ('quoted','starting','prompt_sent','paid','review_required');
CREATE TABLE IF NOT EXISTS public.dbk36_wa_prod_callback_inbox(
 checkout_id text PRIMARY KEY CHECK(length(checkout_id) BETWEEN 6 AND 150),
 merchant_id text NOT NULL,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 query_confirmed_at timestamptz,
 review_code text
);
CREATE TABLE IF NOT EXISTS public.dbk36_wa_prod_payment_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 reference text NOT NULL REFERENCES public.dbk36_wa_prod_payment_orders(reference),
 event_code text NOT NULL CHECK(event_code~'^[A-Z0-9_]{4,80}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.dbk36_wa_prod_payment_orders,public.dbk36_wa_prod_callback_inbox,
 public.dbk36_wa_prod_payment_audit FROM PUBLIC;
-- Existing manual staff data and function remain intact. Permit only a tightly named
-- provider-verified second mode; no automatic claim from ordinary payment statuses.
ALTER TABLE public.dbk36_wa_paid_intake
 DROP CONSTRAINT IF EXISTS dbk36_wa_paid_intake_verification_mode_check;
ALTER TABLE public.dbk36_wa_paid_intake
 ADD CONSTRAINT dbk36_wa_paid_intake_verification_mode_check
 CHECK(verification_mode IN ('staff_till_attested','daraja_api_verified'));
-- v21 stock claim: keep existing logic, but allow provider-verified intake after
-- independent STK Query has been recorded in the DBK36 production payment table.
CREATE OR REPLACE FUNCTION public.dbk36_wa_stock_claim(p_ref text,p_actor text,p_store text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE paid public.dbk36_wa_paid_intake%ROWTYPE;
        claim public.dbk36_wa_stock_fulfillment%ROWTYPE;
BEGIN
 IF coalesce(p_ref,'') !~ '^DBKWA[A-Z0-9]{7}$' OR length(coalesce(p_actor,'')) NOT BETWEEN 2 AND 180
   OR coalesce(p_store,'') !~ '^storeLocation\.[A-Za-z0-9]{20,100}$' THEN
   RAISE EXCEPTION 'DBK36_CLAIM_INPUT_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dbk36_wa_paid_intake_config WHERE singleton AND enabled) THEN
   RAISE EXCEPTION 'DBK36_PAID_INTAKE_GATE_DISABLED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dbk36-stock:'||p_ref,36));
 SELECT * INTO claim FROM public.dbk36_wa_stock_fulfillment WHERE reference=p_ref FOR UPDATE;
 IF FOUND THEN RETURN jsonb_build_object('status',claim.stock_state,'replayed',true,'orderId',claim.order_id); END IF;
 SELECT * INTO paid FROM public.dbk36_wa_paid_intake WHERE reference=p_ref FOR UPDATE;
 IF NOT FOUND OR paid.intake_status <> 'AWAITING_STAFF_STOCK_REVIEW'
   OR paid.attested_at IS NULL OR paid.provider_receipt IS NULL OR NOT (
     paid.verification_mode='staff_till_attested' OR (
     paid.verification_mode='daraja_api_verified' AND paid.attested_by='DBK36_DARAJA_QUERY'
     AND p_actor='DBK36_DARAJA_AUTOMATION' AND EXISTS(
       SELECT 1 FROM public.dbk36_wa_prod_payment_orders po
       JOIN public.dbk36_wa_prod_callback_inbox cb ON cb.checkout_id=po.checkout_id
       WHERE po.reference=paid.reference AND po.status='paid'
       AND po.checkout_id=paid.checkout_id AND po.receipt=paid.provider_receipt
       AND po.amount_kes*100=paid.amount_minor AND po.wa_id=paid.wa_id
       AND cb.query_confirmed_at IS NOT NULL
     ))
   ) THEN RAISE EXCEPTION 'DBK36_PROVIDER_VERIFICATION_REQUIRED'; END IF;
 INSERT INTO public.dbk36_wa_stock_fulfillment
  (reference,order_id,store_id,receipt,customer_phone,amount_minor,cart_snapshot,claimed_by)
 VALUES(p_ref,'DBK36-WA-'||p_ref,p_store,paid.provider_receipt,paid.wa_id,
   paid.amount_minor,paid.cart_snapshot,p_actor)
 RETURNING * INTO claim;
 RETURN jsonb_build_object('status','CLAIMED','replayed',false,'orderId',claim.order_id,
   'claimToken',claim.claim_token::text);
END $fn$;
REVOKE ALL ON FUNCTION public.dbk36_wa_stock_claim(text,text,text) FROM PUBLIC;
-- Fully atomic insertion into the verified production-intake ledger; this function
-- is only called by the authenticated server after independent Daraja status query.
CREATE OR REPLACE FUNCTION public.dbk36_wa_prod_finalize_paid(p_ref text,p_checkout text,p_merchant text,
 p_receipt text,p_phone text,p_amount integer,p_paid_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE o public.dbk36_wa_prod_payment_orders%ROWTYPE; c jsonb; line jsonb; total bigint:=0;
BEGIN
 IF p_ref !~ '^DBKWA[A-Z0-9]{7}$' OR length(coalesce(p_checkout,'')) NOT BETWEEN 6 AND 150
   OR length(coalesce(p_merchant,'')) NOT BETWEEN 6 AND 150
   OR p_receipt !~ '^[A-Za-z0-9]{6,20}$' OR p_phone !~ '^254(7|1)[0-9]{8}$'
   OR p_amount NOT BETWEEN 1 AND 500 OR p_paid_at IS NULL
   OR p_paid_at > now()+interval '5 minutes' OR p_paid_at < now()-interval '7 days'
 THEN RAISE EXCEPTION 'DBK36_PROVIDER_PROOF_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dbk36-autopay:'||p_ref,36));
 SELECT * INTO o FROM public.dbk36_wa_prod_payment_orders WHERE reference=p_ref FOR UPDATE;
 IF NOT FOUND OR o.wa_id<>p_phone OR o.amount_kes<>p_amount
   OR o.checkout_id<>p_checkout OR o.merchant_id<>p_merchant
   OR o.status NOT IN ('prompt_sent','paid','review_required') THEN
   RAISE EXCEPTION 'DBK36_PROVIDER_PROOF_ORDER_MISMATCH'; END IF;
 IF o.status='paid' THEN
   IF o.receipt IS DISTINCT FROM p_receipt THEN RAISE EXCEPTION 'DBK36_RECEIPT_REPLAY_CONFLICT'; END IF;
   RETURN jsonb_build_object('reference',p_ref,'state','paid','replayed',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dbk36_wa_prod_callback_inbox
   WHERE checkout_id=p_checkout AND merchant_id=p_merchant AND query_confirmed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'DBK36_STK_QUERY_CONFIRMATION_MISSING'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dbk36_wa_paid_intake_config WHERE singleton AND enabled)
 THEN RAISE EXCEPTION 'DBK36_INTAKE_GATE_OFF'; END IF;
 IF EXISTS(SELECT 1 FROM public.dbk36_wa_paid_intake WHERE reference=p_ref OR checkout_id=p_checkout
   OR provider_receipt=p_receipt) OR
 EXISTS(SELECT 1 FROM public.dbk56_pos_payments WHERE provider='daraja' AND provider_reference=p_receipt) OR
 EXISTS(SELECT 1 FROM public.dbk55_paid_pos_settlements WHERE payment_provider='daraja'
   AND (provider_receipt=p_receipt OR provider_payment_id=p_checkout)) OR
 EXISTS(SELECT 1 FROM public.dbk68_daraja_orders WHERE receipt_number=p_receipt OR checkout_id=p_checkout)
 THEN RAISE EXCEPTION 'DBK36_PAYMENT_DUPLICATE_OR_POS_CONFLICT'; END IF;
 c:=o.cart_snapshot;
 IF jsonb_typeof(c) <> 'array' OR jsonb_array_length(c) NOT BETWEEN 1 AND 12
 THEN RAISE EXCEPTION 'DBK36_CART_INVALID'; END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(c) LOOP
   IF line->>'productId' IS NULL OR (line->>'quantity') !~ '^[1-9][0-9]*$' OR
     (line->>'subtotalMinor') !~ '^[1-9][0-9]*$'
   THEN RAISE EXCEPTION 'DBK36_CART_LINE_INVALID'; END IF;
   total:=total+(line->>'subtotalMinor')::bigint;
 END LOOP;
 IF total<>p_amount*100 THEN RAISE EXCEPTION 'DBK36_CART_TOTAL_MISMATCH'; END IF;
 INSERT INTO public.dbk36_wa_paid_intake(reference,checkout_id,provider_receipt,merchant_id,
  wa_id,amount_minor,paid_at,cart_snapshot,verification_mode,attested_by,attested_at)
 VALUES(p_ref,p_checkout,p_receipt,p_merchant,p_phone,p_amount*100,p_paid_at,
  c,'daraja_api_verified','DBK36_DARAJA_QUERY',now());
 UPDATE public.dbk36_wa_prod_payment_orders
 SET status='paid',receipt=p_receipt,provider_transaction_at=p_paid_at,paid_at=now(),updated_at=now()
 WHERE reference=p_ref;
 INSERT INTO public.dbk36_wa_prod_payment_audit(reference,event_code)
 VALUES(p_ref,'DARAJA_QUERY_AND_CALLBACK_MATCHED');
 RETURN jsonb_build_object('reference',p_ref,'state','paid','replayed',false);
END $fn$;
REVOKE ALL ON FUNCTION public.dbk36_wa_prod_finalize_paid(text,text,text,text,text,integer,timestamptz) FROM PUBLIC;
COMMIT;
