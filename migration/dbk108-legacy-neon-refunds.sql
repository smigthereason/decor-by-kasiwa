-- DBK108: audit-only ledger of verified, externally completed legacy refunds.
-- Does not contact a payment provider or mutate product stock, Sanity, or debt.
-- Intentionally supports ONLY fully paid, non-Paystack legacy orders with no
-- returned goods. Refunds involving stock, providers or receivables require
-- separate, verified workflows.
CREATE TABLE IF NOT EXISTS public.dbk108_legacy_refund_accounts (
  order_id text PRIMARY KEY,
  source_rev text NOT NULL,
  paid_minor bigint NOT NULL CHECK(paid_minor > 0 AND paid_minor <= 1000000000000),
  original_refunded_minor bigint NOT NULL CHECK(original_refunded_minor >= 0),
  total_minor bigint NOT NULL CHECK(total_minor >= 0),
  store_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(original_refunded_minor <= paid_minor)
);
CREATE TABLE IF NOT EXISTS public.dbk108_legacy_refunds (
  request_key text PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.dbk108_legacy_refund_accounts(order_id) ON DELETE RESTRICT,
  external_reference text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK(amount_minor > 0),
  actor_id text NOT NULL,
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 300),
  payload_hash text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dbk108_legacy_refunds_order_idx ON public.dbk108_legacy_refunds(order_id, recorded_at);
CREATE INDEX IF NOT EXISTS dbk108_legacy_refunds_date_idx ON public.dbk108_legacy_refunds(recorded_at);

CREATE OR REPLACE FUNCTION public.dbk108_record_legacy_refund(p jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_order text := p->>'orderId';
  v_revision text := p->>'sourceRev';
  v_request text := p->>'requestKey';
  v_ref text := p->>'externalReference';
  v_actor text := p->>'actorId';
  v_reason text := p->>'reason';
  v_hash text := p->>'payloadHash';
  v_paid bigint;
  v_total bigint;
  v_original bigint;
  v_amount bigint;
  v_previous bigint;
  v_account public.dbk108_legacy_refund_accounts%ROWTYPE;
  v_prior public.dbk108_legacy_refunds%ROWTYPE;
  v_replayed boolean := false;
BEGIN
  -- Production gates are independently enforced by the database.
  IF NOT EXISTS (
    SELECT 1 FROM public.dbk62_cutover_config c
    JOIN public.dbk63_financial_config f USING(singleton)
    JOIN public.dbk74_freeze_control z USING(singleton)
    WHERE c.singleton AND c.enabled AND c.refunds_ready AND c.reports_ready
      AND c.sanity_stock_frozen AND c.all_stock_writers_switched
      AND c.provider_callbacks_ready AND f.enabled AND NOT z.active
  ) THEN RAISE EXCEPTION 'DBK108 refund cutover gate is not approved'; END IF;
  IF jsonb_typeof(p) IS DISTINCT FROM 'object'
    OR (p - 'orderId' - 'sourceRev' - 'requestKey' - 'externalReference'
       - 'actorId' - 'reason' - 'payloadHash' - 'paidMinor'
       - 'totalMinor' - 'originalRefundedMinor' - 'amountMinor' - 'storeId') <> '{}'::jsonb
    OR length(coalesce(v_order,'')) NOT BETWEEN 2 AND 200
    OR length(coalesce(v_revision,'')) NOT BETWEEN 2 AND 150
    OR coalesce(v_request,'') !~ '^dbk108-[a-f0-9]{64}$'
    OR coalesce(v_hash,'') !~ '^[a-f0-9]{64}$'
    OR coalesce(v_ref,'') !~ '^[A-Za-z0-9._-]{8,100}$'
    OR v_ref ~* '(TEST|SYNTHETIC)'
    OR length(coalesce(v_actor,'')) NOT BETWEEN 1 AND 200
    OR length(coalesce(v_reason,'')) NOT BETWEEN 1 AND 300
    OR length(coalesce(p->>'storeId','')) NOT BETWEEN 1 AND 200
  THEN RAISE EXCEPTION 'Invalid DBK108 refund identity or evidence'; END IF;
  IF jsonb_typeof(p->'paidMinor') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p->'totalMinor') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p->'originalRefundedMinor') IS DISTINCT FROM 'number'
      OR jsonb_typeof(p->'amountMinor') IS DISTINCT FROM 'number'
      OR (p->>'paidMinor') !~ '^(0|[1-9][0-9]*)$'
      OR (p->>'totalMinor') !~ '^(0|[1-9][0-9]*)$'
      OR (p->>'originalRefundedMinor') !~ '^(0|[1-9][0-9]*)$'
      OR (p->>'amountMinor') !~ '^[1-9][0-9]*$'
  THEN RAISE EXCEPTION 'Invalid DBK108 KES minor units'; END IF;
  BEGIN
    v_paid := (p->>'paidMinor')::bigint;
    v_total := (p->>'totalMinor')::bigint;
    v_original := (p->>'originalRefundedMinor')::bigint;
    v_amount := (p->>'amountMinor')::bigint;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'DBK108 KES amount too large';
  END;
  IF v_paid < 1 OR v_paid > 1000000000000 OR v_total <> v_paid
    OR v_original < 0 OR v_original > v_paid OR v_amount < 1 OR v_amount > v_paid - v_original
  THEN RAISE EXCEPTION 'Refund exceeds fully paid historical receipt'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk108-refund:' || v_order,108));
  INSERT INTO public.dbk108_legacy_refund_accounts
    (order_id,source_rev,paid_minor,total_minor,original_refunded_minor,store_id)
  VALUES(v_order,v_revision,v_paid,v_total,v_original,p->>'storeId')
  ON CONFLICT(order_id) DO NOTHING;
  SELECT * INTO STRICT v_account FROM public.dbk108_legacy_refund_accounts
    WHERE order_id=v_order FOR UPDATE;
  IF v_account.source_rev <> v_revision OR v_account.paid_minor<>v_paid
      OR v_account.total_minor<>v_total OR v_account.original_refunded_minor<>v_original
      OR v_account.store_id<>p->>'storeId'
  THEN RAISE EXCEPTION 'Historical source changed; reconcile existing refunds first'; END IF;
  SELECT * INTO v_prior FROM public.dbk108_legacy_refunds WHERE request_key=v_request FOR UPDATE;
  IF FOUND THEN
    IF v_prior.order_id<>v_order OR v_prior.external_reference<>v_ref
      OR v_prior.amount_minor<>v_amount OR v_prior.actor_id<>v_actor
      OR v_prior.reason<>v_reason OR v_prior.payload_hash<>v_hash
    THEN RAISE EXCEPTION 'Conflicting DBK108 refund replay'; END IF;
    v_replayed := true;
  ELSE
    IF EXISTS(SELECT 1 FROM public.dbk108_legacy_refunds WHERE external_reference=v_ref)
    THEN RAISE EXCEPTION 'External refund reference already recorded'; END IF;
    SELECT coalesce(sum(amount_minor),0)::bigint INTO v_previous
      FROM public.dbk108_legacy_refunds WHERE order_id=v_order;
    IF v_previous + v_amount > v_paid - v_original
    THEN RAISE EXCEPTION 'Cumulative refunds exceed historical receipt'; END IF;
    INSERT INTO public.dbk108_legacy_refunds
      (request_key,order_id,external_reference,amount_minor,actor_id,reason,payload_hash)
    VALUES(v_request,v_order,v_ref,v_amount,v_actor,v_reason,v_hash);
  END IF;
  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_previous
    FROM public.dbk108_legacy_refunds WHERE order_id=v_order;
  RETURN jsonb_build_object('orderId',v_order,
    'refundId','dbk108.refund.' || md5(v_request),
    'returnNumber','RET-' || upper(substring(md5(v_request) from 1 for 12)),
    'refundedMinor',v_amount,'totalRefundedMinor',v_original+v_previous,
    'replayed',v_replayed, 'externalTransferPerformed',false, 'stockChanged',false);
END $$;
REVOKE ALL ON FUNCTION public.dbk108_record_legacy_refund(jsonb) FROM PUBLIC;
