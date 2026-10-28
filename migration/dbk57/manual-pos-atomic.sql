-- DBK-57: TEST BRANCH ONLY. Composite manual POS order/payment/stock transaction.
-- Do not apply to production. Nothing in current POS routes calls this function.
-- Requires DBK-51 stock, DBK-54 basket and DBK-56 ledger migrations on dbk51-test.
-- CASH / MANUAL receipts must be independently verified by a cashier; this SQL cannot verify money.
CREATE TABLE IF NOT EXISTS public.dbk57_manual_sale_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk57_manual_sale_config(singleton,enabled) VALUES(true,false)
ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dbk57_manual_sales (
  request_key text PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES public.dbk56_pos_orders(order_id) ON DELETE RESTRICT,
  original_payload jsonb NOT NULL,
  result_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.dbk57_record_manual_sale(p_request_key text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_order jsonb := p_payload->'order';
  v_payment jsonb := p_payload->'payment';
  v_order_id text := v_order->>'orderId';
  v_store_id text := v_order->>'storeId';
  v_total bigint;
  v_paid bigint;
  v_stock_items jsonb;
  v_order_result jsonb;
  v_stock_result jsonb;
  v_payment_result jsonb;
  v_result jsonb;
  v_existing public.dbk57_manual_sales%ROWTYPE;
  v_batch_id text;
  v_event_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dbk57_manual_sale_config WHERE singleton AND enabled)
  THEN RAISE EXCEPTION 'DBK-57 manual sale gate is disabled'; END IF;

  IF p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 12 AND 120
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_payload - 'order' - 'payment' - 'cashierConfirmed' - 'overpaymentApproved' <> '{}'::jsonb
     OR p_payload->'cashierConfirmed' IS DISTINCT FROM 'true'::jsonb
     OR jsonb_typeof(v_order) IS DISTINCT FROM 'object'
     OR jsonb_typeof(v_payment) IS DISTINCT FROM 'object'
     OR nullif(v_order_id,'') IS NULL OR length(v_order_id)>180
     OR nullif(v_store_id,'') IS NULL
     OR v_order->>'channel' IS DISTINCT FROM 'POS'
     OR v_order->>'currency' IS DISTINCT FROM 'KES'
     OR v_payment->>'orderId' IS DISTINCT FROM v_order_id
     OR v_payment->>'provider' IS DISTINCT FROM 'manual'
     OR v_payment->>'purpose' IS DISTINCT FROM 'INITIAL'
     OR nullif(v_payment->>'evidenceReference','') IS NULL
     OR length(v_payment->>'evidenceReference')<5
     OR jsonb_typeof(v_payment->'amountMinor') IS DISTINCT FROM 'number'
     OR coalesce(v_payment->>'amountMinor','') !~ '^[1-9][0-9]*$'
     OR length(v_payment->>'amountMinor')>13
     OR jsonb_typeof(v_order->'items') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid DBK-57 manual sale payload'; END IF;

  -- Caller must not select stock movements independently from order lines.
  -- All stock lines are derived from the exact lines persisted in DBK-56.
  SELECT jsonb_agg(jsonb_build_object(
      'productId', line.value->>'productId',
      'variantId', coalesce(line.value->>'variantId',''),
      'quantity', (line.value->>'quantity')::integer,
      'sourceStoreId', v_store_id
    ) ORDER BY line.ordinality)
    INTO v_stock_items
  FROM jsonb_array_elements(v_order->'items') WITH ORDINALITY AS line(value,ordinality);
  IF v_stock_items IS NULL OR jsonb_array_length(v_stock_items) NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'Invalid DBK-57 stock lines'; END IF;

  -- Lock the request and the order. The child functions use their existing locks too.
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk57:request:'||p_request_key,57));
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk57:order:'||v_order_id,57));
  SELECT * INTO v_existing FROM public.dbk57_manual_sales WHERE request_key=p_request_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.original_payload <> p_payload
    THEN RAISE EXCEPTION 'Conflicting DBK-57 manual sale replay'; END IF;
    RETURN v_existing.result_payload || jsonb_build_object('replayed',true);
  END IF;

  -- Child gates MUST be enabled *only on the isolated test branch*.
  IF NOT EXISTS (SELECT 1 FROM public.dbk51_stock_engine_config WHERE singleton AND writes_enabled AND seed_fingerprint IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.dbk56_ledger_config WHERE singleton AND enabled)
  THEN RAISE EXCEPTION 'DBK-57 child write gates disabled'; END IF;

  v_order_result := public.dbk56_create_pos_order('dbk57-'||p_request_key,v_order);
  IF v_order_result->>'replayed' = 'true' THEN
    RAISE EXCEPTION 'Existing DBK-56 order cannot be adopted by DBK-57';
  END IF;
  v_total := (v_order_result->>'totalMinor')::bigint;
  v_paid := (v_payment->>'amountMinor')::bigint;
  IF v_paid > 1000000000000 OR (v_paid > v_total AND p_payload->'overpaymentApproved' IS DISTINCT FROM 'true'::jsonb)
  THEN RAISE EXCEPTION 'DBK-57 overpayment requires cashier approval'; END IF;

  v_batch_id := 'dbk57-stock-'||md5(p_request_key);
  v_stock_result := public.dbk54_apply_stock_batch(v_batch_id,jsonb_build_object(
    'type','SALE','orderId',v_order_id,'items',v_stock_items));

  -- If stock fails OR the provider reference is duplicate, the enclosing PostgreSQL
  -- transaction rolls back the order, payment, stock and DBK-57 request record.
  v_event_key := 'dbk57-payment-'||md5(p_request_key);
  v_payment_result := public.dbk56_record_pos_payment(v_event_key,v_payment);
  v_result := jsonb_build_object(
    'orderId',v_order_id,'stockBatchId',v_batch_id,
    'totalMinor',v_total,'financialStatus',v_payment_result->>'financialStatus',
    'balanceDueMinor',v_payment_result->'balanceDueMinor',
    'overpaidMinor',v_payment_result->'overpaidMinor',
    'stockCommitted',true,'replayed',false);
  INSERT INTO public.dbk57_manual_sales(request_key,order_id,original_payload,result_payload)
    VALUES(p_request_key,v_order_id,p_payload,v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dbk57_record_manual_sale(text,jsonb) FROM PUBLIC;
