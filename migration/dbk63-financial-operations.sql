-- DBK-63: manual POS follow-up collections and externally confirmed refunds.
-- NEVER enable on production until approved DBK-62 cutover and complete callback/report
-- migrations. Independently disabled, even when the tables/functions are installed.
-- Requires DBK-51/54/56/57/62 schemas. No sales/payment/stock write on installation.
CREATE TABLE IF NOT EXISTS public.dbk63_financial_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk63_financial_config(singleton,enabled) VALUES(true,false)
ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dbk63_pos_refunds (
  request_key text PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.dbk62_manual_sales(order_id) ON DELETE RESTRICT,
  manual_reference text NOT NULL UNIQUE,
  refund_minor bigint NOT NULL CHECK(refund_minor >= 0 AND refund_minor <= 1000000000000),
  restock boolean NOT NULL,
  items jsonb NOT NULL,
  request_payload jsonb NOT NULL,
  result_payload jsonb NOT NULL,
  seller_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK(jsonb_typeof(items) = 'array')
);
CREATE INDEX IF NOT EXISTS dbk63_refunds_order_idx ON public.dbk63_pos_refunds(order_id,recorded_at);

CREATE OR REPLACE FUNCTION public.dbk63_financial_gate() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.dbk63_financial_config f
    JOIN public.dbk62_cutover_config c ON c.singleton=f.singleton
    JOIN public.dbk51_stock_engine_config s ON s.singleton=c.singleton
    JOIN public.dbk56_ledger_config l ON l.singleton=c.singleton
    JOIN public.dbk57_manual_sale_config m ON m.singleton=c.singleton
    WHERE f.singleton AND f.enabled AND c.enabled AND c.sanity_stock_frozen
      AND c.all_stock_writers_switched AND c.provider_callbacks_ready AND
      c.receivables_ready AND c.refunds_ready AND c.reports_ready
      AND c.reconciliation_fingerprint IS NOT NULL
      AND length(c.reconciliation_fingerprint)>=32
      AND c.reconciliation_fingerprint=s.seed_fingerprint
      AND s.writes_enabled AND l.enabled AND m.enabled
  ) THEN RAISE EXCEPTION 'DBK-63 Neon financial cutover is disabled'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.dbk63_record_receivable(p_event_key text,p_payment jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_order_id text := p_payment->>'orderId';
  v_order public.dbk56_pos_orders%ROWTYPE;
  v_result jsonb;
BEGIN
  PERFORM public.dbk63_financial_gate();
  IF coalesce(p_event_key,'') !~ '^dbk63-payment-[0-9a-f]{32}$'
    OR coalesce(v_order_id,'') !~ '^dbk62[.]order[.][0-9a-f]{24}$'
    OR jsonb_typeof(p_payment) IS DISTINCT FROM 'object'
    OR (p_payment - 'orderId' - 'provider' - 'providerReference' - 'purpose' - 'amountMinor' - 'evidenceReference') <> '{}'::jsonb
    OR p_payment->>'provider' IS DISTINCT FROM 'manual'
    OR p_payment->>'purpose' IS DISTINCT FROM 'RECEIVABLE'
    OR coalesce(p_payment->>'providerReference','') !~ '^[A-Za-z0-9._-]{5,100}$'
    OR p_payment->>'providerReference' ~* '(TEST|SYNTHETIC)'
    OR p_payment->>'evidenceReference' IS DISTINCT FROM 'cashier-confirmed-' || substring(p_event_key from 15)
  THEN RAISE EXCEPTION 'Invalid DBK-63 receivable evidence'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk63:order:'||v_order_id,63));
  SELECT * INTO v_order FROM public.dbk56_pos_orders WHERE order_id=v_order_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.dbk62_manual_sales WHERE order_id=v_order_id)
  THEN RAISE EXCEPTION 'Receivable is not a persisted real DBK-62 sale'; END IF;
  IF EXISTS(SELECT 1 FROM public.dbk63_pos_refunds WHERE order_id=v_order_id)
     AND NOT EXISTS(SELECT 1 FROM public.dbk56_pos_payments WHERE event_key=p_event_key)
  THEN RAISE EXCEPTION 'Cannot add a new payment after a recorded refund; reconcile first'; END IF;
  -- DBK-56 enforces nonoverpayment, reference uniqueness, exact replay and order locking.
  v_result := public.dbk56_record_pos_payment(p_event_key,p_payment);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.dbk63_record_manual_refund(p_request_key text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_order_id text := p_payload->>'orderId';
  v_reference text := p_payload->>'manualRefundReference';
  v_refund_text text := p_payload->>'refundMinor';
  v_items jsonb := p_payload->'items';
  v_item jsonb;
  v_existing public.dbk63_pos_refunds%ROWTYPE;
  v_order public.dbk56_pos_orders%ROWTYPE;
  v_returned bigint;
  v_refund bigint;
  v_batch jsonb;
  v_stock_items jsonb;
  v_result jsonb;
  v_return_id text;
BEGIN
  PERFORM public.dbk63_financial_gate();
  IF coalesce(p_request_key,'') !~ '^dbk63-refund-[0-9a-f]{32}$'
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR (p_payload - 'orderId' - 'receiptNumber' - 'refundMinor' - 'reason' - 'restock'
       - 'manualRefundConfirmed' - 'manualRefundReference' - 'items' - 'sellerId') <> '{}'::jsonb
    OR coalesce(v_order_id,'') !~ '^dbk62[.]order[.][0-9a-f]{24}$'
    OR coalesce(v_reference,'') !~ '^[A-Za-z0-9._-]{5,100}$'
    OR v_reference ~* '(TEST|SYNTHETIC)'
    OR coalesce(p_payload->>'reason','') = '' OR length(p_payload->>'reason')>300
    OR coalesce(p_payload->>'sellerId','') = '' OR length(p_payload->>'sellerId')>180
    OR coalesce(p_payload->>'refundMinor','') !~ '^(0|[1-9][0-9]*)$'
    OR jsonb_typeof(p_payload->'refundMinor') IS DISTINCT FROM 'number'
    OR length(v_refund_text)>13 OR v_refund_text::numeric>1000000000000
    OR jsonb_typeof(p_payload->'restock') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_payload->'manualRefundConfirmed') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(v_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_items)>100
  THEN RAISE EXCEPTION 'Invalid DBK-63 refund request'; END IF;
  v_refund := v_refund_text::bigint;
  IF (v_refund=0 AND p_payload->'restock'='false'::jsonb)
    OR (v_refund>0 AND p_payload->'manualRefundConfirmed' IS DISTINCT FROM 'true'::jsonb)
    OR (p_payload->'restock'='true'::jsonb AND jsonb_array_length(v_items)=0)
    OR (p_payload->'restock'='false'::jsonb AND jsonb_array_length(v_items)>0)
  THEN RAISE EXCEPTION 'Refund requires external confirmation or valid stock return'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR (v_item - 'productId' - 'variantId' - 'quantity') <> '{}'::jsonb
      OR coalesce(v_item->>'productId','') !~ '^[A-Za-z0-9._-]{1,180}$'
      OR coalesce(v_item->>'variantId','') !~ '^[A-Za-z0-9._-]{0,180}$'
      OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
      OR coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]*$'
      OR length(v_item->>'quantity')>7 OR (v_item->>'quantity')::numeric>1000000
    THEN RAISE EXCEPTION 'Invalid returned inventory line'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(v_items)) <>
      (SELECT count(DISTINCT (value->>'productId',value->>'variantId')) FROM jsonb_array_elements(v_items))
  THEN RAISE EXCEPTION 'Duplicate return item'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dbk63:order:'||v_order_id,63));
  SELECT * INTO v_existing FROM public.dbk63_pos_refunds WHERE request_key=p_request_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_payload<>p_payload THEN RAISE EXCEPTION 'Conflicting refund idempotency replay'; END IF;
    RETURN v_existing.result_payload || jsonb_build_object('replayed',true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.dbk63_pos_refunds WHERE manual_reference=v_reference)
     OR EXISTS(SELECT 1 FROM public.dbk56_pos_payments WHERE provider_reference=v_reference)
  THEN RAISE EXCEPTION 'Refund reference already recorded'; END IF;

  SELECT * INTO v_order FROM public.dbk56_pos_orders WHERE order_id=v_order_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.dbk62_manual_sales WHERE order_id=v_order_id)
  THEN RAISE EXCEPTION 'Unknown real manual POS order'; END IF;
  -- Partial-payment cancellations and Paystack/provider refunds require a separate workflow.
  IF v_order.balance_due_minor<>0 OR v_order.collected_minor<>v_order.total_minor
  THEN RAISE EXCEPTION 'Only fully paid exact-amount manual POS orders can be refunded'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dbk62_manual_sales s
    WHERE s.order_id=v_order_id AND s.display_snapshot->>'receiptNumber'=p_payload->>'receiptNumber')
  THEN RAISE EXCEPTION 'Incorrect refund receipt'; END IF;
  SELECT coalesce(sum(refund_minor),0) INTO v_returned FROM public.dbk63_pos_refunds WHERE order_id=v_order_id;
  IF v_returned+v_refund>v_order.collected_minor
  THEN RAISE EXCEPTION 'Refund exceeds amount collected on receipt'; END IF;

  IF p_payload->'restock'='true'::jsonb THEN
    -- Stock operation is called INSIDE this function/statement. If it fails,
    -- the refund ledger also rolls back. DBK-54 bounds cumulative returns to sold stock.
    SELECT jsonb_agg(jsonb_build_object('productId',v.value->>'productId',
      'variantId',v.value->>'variantId','quantity',(v.value->>'quantity')::integer,
      'destinationStoreId',v_order.store_id) ORDER BY v.ordinality)
      INTO v_stock_items
      FROM jsonb_array_elements(v_items) WITH ORDINALITY AS v(value,ordinality);
    v_batch := public.dbk54_apply_stock_batch('dbk63-return-' || md5(p_request_key),
      jsonb_build_object('type','RETURN','orderId',v_order_id,'items',v_stock_items));
    IF v_batch->>'replayed' IS DISTINCT FROM 'false'
    THEN RAISE EXCEPTION 'Unexpected stock return replay'; END IF;
  END IF;
  v_return_id := 'dbk63.refund.' || md5(p_request_key);
  v_result := jsonb_build_object('orderId',v_order_id,'refundId',v_return_id,
    'returnNumber','RET-'||upper(substring(md5(p_request_key) from 1 for 12)),
    'refundMinor',v_refund,'totalRefundedMinor',v_returned+v_refund,
    'restocked',p_payload->'restock'='true'::jsonb,'replayed',false);
  INSERT INTO public.dbk63_pos_refunds(request_key,order_id,manual_reference,
    refund_minor,restock,items,request_payload,result_payload,seller_id)
    VALUES(p_request_key,v_order_id,v_reference,v_refund,
      p_payload->'restock'='true'::jsonb,v_items,p_payload,v_result,p_payload->>'sellerId');
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dbk63_financial_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk63_record_receivable(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk63_record_manual_refund(text,jsonb) FROM PUBLIC;
