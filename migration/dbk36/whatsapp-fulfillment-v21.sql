-- DBK-36 v21: MAIN production Neon ONLY. Additive isolated order/stock fulfillment ledger.
-- NOT a POS cutover. No M-Pesa calls, no inventory SQL mutation, no public bot access.
-- A one-time claim MUST NOT be automatically retried after an ambiguous Sanity write.
BEGIN;
DO $schema$
BEGIN
 IF to_regclass('public.dbk36_wa_paid_intake') IS NULL OR
    to_regclass('public.dbk36_wa_paid_intake_config') IS NULL THEN
   RAISE EXCEPTION 'DBK36_V7_PAID_INTAKE_REQUIRED';
 END IF;
END;
$schema$;
CREATE TABLE IF NOT EXISTS public.dbk36_wa_stock_fulfillment (
 reference text PRIMARY KEY REFERENCES public.dbk36_wa_paid_intake(reference) ON DELETE RESTRICT,
 order_id text NOT NULL UNIQUE,
 claim_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 store_id text NOT NULL,
 receipt text NOT NULL UNIQUE,
 customer_phone text NOT NULL,
 amount_minor bigint NOT NULL CHECK (amount_minor > 0),
 cart_snapshot jsonb NOT NULL CHECK (jsonb_typeof(cart_snapshot) = 'array'),
 stock_state text NOT NULL DEFAULT 'CLAIMED'
   CHECK(stock_state IN ('CLAIMED','COMMITTED','REVIEW_REQUIRED')),
 fulfillment_state text NOT NULL DEFAULT 'PENDING_STAFF_CONFIRMATION'
   CHECK(fulfillment_state IN ('PENDING_STAFF_CONFIRMATION','PREPARING','READY_FOR_PICKUP','HANDED_OVER','REFUND_REVIEW')),
 claimed_by text NOT NULL,
 claimed_at timestamptz NOT NULL DEFAULT now(),
 stock_committed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 last_error_code text,
 finalized_by text
);
CREATE INDEX IF NOT EXISTS dbk36_wa_stock_fulfillment_state_idx
  ON public.dbk36_wa_stock_fulfillment(stock_state,claimed_at DESC);
REVOKE ALL ON public.dbk36_wa_stock_fulfillment FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.dbk36_wa_stock_claim(p_ref text,p_actor text,p_store text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE paid public.dbk36_wa_paid_intake%ROWTYPE;
        claim public.dbk36_wa_stock_fulfillment%ROWTYPE;
BEGIN
 IF coalesce(p_ref,'') !~ '^DBKWA[A-Z0-9]{7}$' OR length(coalesce(p_actor,'')) NOT BETWEEN 2 AND 180
   OR coalesce(p_store,'') !~ '^storeLocation\.[A-Za-z0-9]{20,100}$' THEN
   RAISE EXCEPTION 'DBK36_CLAIM_INPUT_INVALID';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dbk36_wa_paid_intake_config WHERE singleton AND enabled) THEN
   RAISE EXCEPTION 'DBK36_PAID_INTAKE_GATE_DISABLED';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dbk36-stock:'||p_ref,36));
 SELECT * INTO claim FROM public.dbk36_wa_stock_fulfillment WHERE reference=p_ref FOR UPDATE;
 IF FOUND THEN
   -- A claimed/ambiguous stock write is NEVER retried blindly.
   RETURN jsonb_build_object('status',claim.stock_state,'replayed',true,'orderId',claim.order_id);
 END IF;
 SELECT * INTO paid FROM public.dbk36_wa_paid_intake WHERE reference=p_ref FOR UPDATE;
 IF NOT FOUND OR paid.verification_mode <> 'staff_till_attested'
   OR paid.intake_status <> 'AWAITING_STAFF_STOCK_REVIEW'
   OR paid.attested_at IS NULL OR paid.provider_receipt IS NULL THEN
   RAISE EXCEPTION 'DBK36_TILL_ATTESTED_INTAKE_REQUIRED';
 END IF;
 INSERT INTO public.dbk36_wa_stock_fulfillment
  (reference,order_id,store_id,receipt,customer_phone,amount_minor,cart_snapshot,claimed_by)
 VALUES(p_ref,'DBK36-WA-'||p_ref,p_store,paid.provider_receipt,paid.wa_id,
   paid.amount_minor,paid.cart_snapshot,p_actor)
 RETURNING * INTO claim;
 RETURN jsonb_build_object('status','CLAIMED','replayed',false,'orderId',claim.order_id,
   'claimToken',claim.claim_token::text);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dbk36_wa_stock_finish(
 p_ref text,p_claim uuid,p_actor text,p_state text,p_error text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE c public.dbk36_wa_stock_fulfillment%ROWTYPE;
BEGIN
 IF p_state NOT IN ('COMMITTED','REVIEW_REQUIRED') OR
   coalesce(p_error,'') !~ '^[A-Z0-9_]{0,80}$' THEN
   RAISE EXCEPTION 'DBK36_FINISH_INPUT_INVALID';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dbk36-stock:'||p_ref,36));
 SELECT * INTO c FROM public.dbk36_wa_stock_fulfillment WHERE reference=p_ref FOR UPDATE;
 IF NOT FOUND OR c.claim_token <> p_claim OR c.claimed_by <> p_actor THEN
   RAISE EXCEPTION 'DBK36_CLAIM_NOT_FOUND_OR_MISMATCH';
 END IF;
 IF c.stock_state = 'COMMITTED' THEN
   RETURN jsonb_build_object('status','COMMITTED','replayed',true,'orderId',c.order_id);
 END IF;
 IF c.stock_state <> 'CLAIMED' THEN
   RETURN jsonb_build_object('status',c.stock_state,'replayed',true,'orderId',c.order_id);
 END IF;
 UPDATE public.dbk36_wa_stock_fulfillment
 SET stock_state=p_state, updated_at=now(),
   stock_committed_at=CASE WHEN p_state='COMMITTED' THEN now() ELSE NULL END,
   finalized_by=p_actor,last_error_code=CASE WHEN p_state='REVIEW_REQUIRED' THEN p_error ELSE NULL END
 WHERE reference=p_ref;
 IF p_state='COMMITTED' THEN
   UPDATE public.dbk36_wa_paid_intake SET intake_status='HANDLED_MANUALLY' WHERE reference=p_ref;
 END IF;
 RETURN jsonb_build_object('status',p_state,'replayed',false,'orderId',c.order_id);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.dbk36_wa_set_fulfillment_state(
 p_ref text,p_actor text,p_state text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE c public.dbk36_wa_stock_fulfillment%ROWTYPE;
BEGIN
 IF length(coalesce(p_actor,'')) NOT BETWEEN 2 AND 180 OR p_state NOT IN
  ('PREPARING','READY_FOR_PICKUP','HANDED_OVER','REFUND_REVIEW') THEN
   RAISE EXCEPTION 'DBK36_FULFILLMENT_INPUT_INVALID';
 END IF;
 SELECT * INTO c FROM public.dbk36_wa_stock_fulfillment
 WHERE reference=p_ref FOR UPDATE;
 IF NOT FOUND OR c.stock_state <> 'COMMITTED' THEN
   RAISE EXCEPTION 'DBK36_STOCK_NOT_COMMITTED';
 END IF;
 IF c.fulfillment_state='HANDED_OVER' AND p_state<>'HANDED_OVER' THEN
   RAISE EXCEPTION 'DBK36_CANNOT_REOPEN_HANDED_OVER';
 END IF;
 IF c.fulfillment_state='REFUND_REVIEW' AND p_state<>'REFUND_REVIEW' THEN
   RAISE EXCEPTION 'DBK36_REFUND_REVIEW_LOCKED';
 END IF;
 -- Refund review is a state only; no M-Pesa reversal or stock restock happens.
 UPDATE public.dbk36_wa_stock_fulfillment
 SET fulfillment_state=p_state,updated_at=now(),finalized_by=p_actor WHERE reference=p_ref;
 RETURN jsonb_build_object('reference',p_ref,'status',p_state);
END;
$fn$;
REVOKE ALL ON FUNCTION public.dbk36_wa_stock_claim(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk36_wa_stock_finish(text,uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk36_wa_set_fulfillment_state(text,text,text) FROM PUBLIC;
COMMIT;
