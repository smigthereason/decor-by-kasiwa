-- DBK-68: guarded direct Daraja POS on the production Neon ledger.
-- This is schema preparation, NOT permission to switch production.
-- Depends on DBK-51, DBK-54, DBK-55 and DBK-62; gates default OFF.
CREATE TABLE IF NOT EXISTS public.dbk68_daraja_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk68_daraja_config(singleton,enabled) VALUES(true,false)
ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dbk68_daraja_orders (
  reference text PRIMARY KEY,
  order_id text NOT NULL UNIQUE,
  order_number text NOT NULL UNIQUE,
  store_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=1000000000000),
  phone text NOT NULL CHECK(phone ~ '^254(7|1)[0-9]{8}$'),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  payment_status text NOT NULL DEFAULT 'CREATED'
    CHECK(payment_status IN ('CREATED','STARTING','INIT_FAILED','PENDING','FAILED','PAID')),
  stock_status text NOT NULL DEFAULT 'NOT_ATTEMPTED'
    CHECK(stock_status IN ('NOT_ATTEMPTED','COMMITTED','REVIEW_REQUIRED')),
  checkout_id text UNIQUE,
  merchant_id text,
  receipt_number text UNIQUE,
  result_description text,
  result_code integer,
  callback_json jsonb,
  stock_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS dbk68_daraja_status_idx
  ON public.dbk68_daraja_orders(payment_status,stock_status,created_at DESC);

CREATE OR REPLACE FUNCTION public.dbk68_daraja_gate() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.dbk68_daraja_config d
    JOIN public.dbk62_cutover_config c USING(singleton)
    JOIN public.dbk55_settlement_config p USING(singleton)
    JOIN public.dbk51_stock_engine_config s USING(singleton)
    WHERE d.singleton AND d.enabled AND c.enabled AND p.enabled
      AND c.sanity_stock_frozen AND c.all_stock_writers_switched
      AND c.provider_callbacks_ready AND c.receivables_ready AND c.refunds_ready
      AND c.reports_ready AND s.writes_enabled
      AND length(coalesce(c.reconciliation_fingerprint,''))>=32
      AND c.reconciliation_fingerprint=s.seed_fingerprint
  ) THEN RAISE EXCEPTION 'DBK-68 Daraja POS cutover disabled'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.dbk68_create_pending(p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_ref text:=p_snapshot->>'reference';
  v_amount text:=p_snapshot->>'totalMinor';
  v_subtotal text:=p_snapshot->>'subtotalMinor';
  v_discount text:=p_snapshot->>'discountMinor';
  v_existing public.dbk68_daraja_orders%ROWTYPE;
  v_line jsonb;
  v_sum numeric:=0;
BEGIN
  PERFORM public.dbk68_daraja_gate();
  IF jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
    OR (p_snapshot - 'reference' - 'orderId' - 'orderNumber' - 'storeId'
        - 'sellerId' - 'sellerName' - 'customerName' - 'customerPhone'
        - 'totalMinor' - 'subtotalMinor' - 'discountMinor' - 'lines') <> '{}'::jsonb
    OR coalesce(v_ref,'') !~ '^DBK-POS-[A-Za-z0-9-]{8,80}$'
    OR p_snapshot->>'orderId' !~ '^dbk68[.]order[.][0-9a-f]{24}$'
    OR p_snapshot->>'orderNumber' !~ '^DBK68-POS-[0-9a-f]{24}$'
    OR length(coalesce(p_snapshot->>'storeId','')) NOT BETWEEN 2 AND 180
    OR length(coalesce(p_snapshot->>'sellerId','')) NOT BETWEEN 2 AND 180
    OR length(coalesce(p_snapshot->>'sellerName','')) NOT BETWEEN 1 AND 150
    OR length(coalesce(p_snapshot->>'customerName','')) NOT BETWEEN 1 AND 150
    OR p_snapshot->>'customerPhone' !~ '^254(7|1)[0-9]{8}$'
    OR coalesce(v_amount,'') !~ '^[1-9][0-9]*$' OR length(v_amount)>13
    OR coalesce(v_subtotal,'') !~ '^[1-9][0-9]*$' OR length(v_subtotal)>13
    OR coalesce(v_discount,'') !~ '^(0|[1-9][0-9]*)$' OR length(v_discount)>13
    OR jsonb_typeof(p_snapshot->'totalMinor') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_snapshot->'subtotalMinor') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_snapshot->'discountMinor') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_snapshot->'lines') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_snapshot->'lines') NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'Invalid DBK-68 pending order'; END IF;
  IF v_amount::numeric>1000000000000 OR v_subtotal::numeric>1000000000000
    OR v_subtotal::numeric-v_discount::numeric<>v_amount::numeric
    OR mod(v_amount::numeric,100)<>0
  THEN RAISE EXCEPTION 'Invalid DBK-68 whole-KES total'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_snapshot->'lines') LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
      OR (v_line - 'productId' - 'variantId' - 'quantity' - 'unitPriceMinor' - 'name') <> '{}'::jsonb
      OR length(coalesce(v_line->>'productId','')) NOT BETWEEN 2 AND 180
      OR v_line->>'variantId'='__UNALLOCATED_VARIANT__'
      OR coalesce(v_line->>'quantity','') !~ '^[1-9][0-9]*$'
      OR length(v_line->>'quantity')>9
      OR coalesce(v_line->>'unitPriceMinor','') !~ '^[1-9][0-9]*$'
      OR length(v_line->>'unitPriceMinor')>13
      OR length(coalesce(v_line->>'name','')) NOT BETWEEN 1 AND 200
      OR jsonb_typeof(v_line->'quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_line->'unitPriceMinor') IS DISTINCT FROM 'number'
    THEN RAISE EXCEPTION 'Invalid DBK-68 cart line'; END IF;
    v_sum:=v_sum+(v_line->>'quantity')::numeric*(v_line->>'unitPriceMinor')::numeric;
  END LOOP;
  IF v_sum<>v_subtotal::numeric THEN RAISE EXCEPTION 'DBK-68 POS prices disagree with subtotal'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk68:'||v_ref,68));
  SELECT * INTO v_existing FROM public.dbk68_daraja_orders WHERE reference=v_ref FOR UPDATE;
  IF FOUND THEN
    IF v_existing.snapshot<>p_snapshot THEN RAISE EXCEPTION 'Conflicting DBK-68 checkout replay'; END IF;
    RETURN jsonb_build_object('created',false,'paymentStatus',v_existing.payment_status);
  END IF;
  INSERT INTO public.dbk68_daraja_orders(reference,order_id,order_number,store_id,
     amount_minor,phone,snapshot)
  VALUES(v_ref,p_snapshot->>'orderId',p_snapshot->>'orderNumber',
     p_snapshot->>'storeId',v_amount::bigint,p_snapshot->>'customerPhone',p_snapshot);
  RETURN jsonb_build_object('created',true,'paymentStatus','CREATED');
END;
$$;

-- Permanently claim the one permitted STK attempt. After an ambiguous network
-- failure, only operator/provider reconciliation may resolve it; never auto-prompt twice.
CREATE OR REPLACE FUNCTION public.dbk68_claim_stk(p_reference text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
  PERFORM public.dbk68_daraja_gate();
  UPDATE public.dbk68_daraja_orders SET payment_status='STARTING',updated_at=now()
  WHERE reference=p_reference AND payment_status='CREATED';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count=1;
END;
$$;

CREATE OR REPLACE FUNCTION public.dbk68_attach_stk(p_reference text,p_checkout text,p_merchant text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.dbk68_daraja_gate();
  IF length(coalesce(p_checkout,'')) NOT BETWEEN 8 AND 150
    OR length(coalesce(p_merchant,'')) NOT BETWEEN 8 AND 150 THEN
    RAISE EXCEPTION 'Invalid provider STK identifiers'; END IF;
  UPDATE public.dbk68_daraja_orders
  SET checkout_id=p_checkout,merchant_id=p_merchant,payment_status='PENDING',updated_at=now()
  WHERE reference=p_reference AND payment_status='STARTING';
  IF NOT FOUND THEN RAISE EXCEPTION 'DBK-68 cannot attach an unexpected STK response'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.dbk68_note_callback(p_checkout text,p_callback jsonb)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_found boolean:=false;
BEGIN
  PERFORM public.dbk68_daraja_gate();
  IF length(coalesce(p_checkout,'')) NOT BETWEEN 8 AND 150
    OR jsonb_typeof(p_callback) IS DISTINCT FROM 'object'
    OR length(p_callback::text)>4000 THEN RAISE EXCEPTION 'Invalid callback'; END IF;
  UPDATE public.dbk68_daraja_orders
  SET callback_json=p_callback,updated_at=now()
  WHERE checkout_id=p_checkout AND payment_status='PENDING'
    AND (callback_json IS NULL OR callback_json=p_callback);
  v_found:=FOUND;
  RETURN v_found;
END;
$$;

-- Only call after server-side STK QUERY confirms ResultCode=0, plus receipt,
-- checkout, merchant, phone and amount checks on original matched callback.
CREATE OR REPLACE FUNCTION public.dbk68_settle_verified(p_reference text,p_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_order public.dbk68_daraja_orders%ROWTYPE;
  v_receipt text:=p_proof->>'receipt';
  v_amount text:=p_proof->>'amountMinor';
  v_checkout text:=p_proof->>'checkoutId';
  v_paid text:=p_proof->>'paidAt';
  v_lines jsonb;
  v_result jsonb;
BEGIN
  PERFORM public.dbk68_daraja_gate();
  IF jsonb_typeof(p_proof) IS DISTINCT FROM 'object'
    OR (p_proof - 'checkoutId' - 'merchantId' - 'receipt' - 'amountMinor'
      - 'phone' - 'paidAt' - 'queryResultCode') <> '{}'::jsonb
    OR coalesce(v_receipt,'') !~ '^[A-Za-z0-9-]{6,30}$'
    OR coalesce(v_checkout,'') = '' OR coalesce(v_paid,'') = ''
    OR coalesce(v_amount,'') !~ '^[1-9][0-9]*$'
    OR length(v_amount)>13
    OR p_proof->>'queryResultCode'<>'0'
    OR jsonb_typeof(p_proof->'amountMinor') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'Invalid DBK-68 provider confirmation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk68:'||p_reference,68));
  SELECT * INTO v_order FROM public.dbk68_daraja_orders WHERE reference=p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DBK-68 order not found'; END IF;
  IF v_order.checkout_id IS DISTINCT FROM v_checkout
    OR v_order.merchant_id IS DISTINCT FROM p_proof->>'merchantId'
    OR v_order.phone IS DISTINCT FROM p_proof->>'phone'
    OR v_order.amount_minor<>v_amount::bigint
    OR v_order.payment_status NOT IN ('PENDING','PAID')
  THEN RAISE EXCEPTION 'Daraja proof/order mismatch'; END IF;
  IF v_order.payment_status='PAID' THEN
    IF v_order.receipt_number<>v_receipt THEN RAISE EXCEPTION 'Conflicting paid receipt replay'; END IF;
    RETURN jsonb_build_object('paymentStatus','PAID','stockStatus',v_order.stock_status,'replayed',true);
  END IF;
  SELECT jsonb_agg(jsonb_build_object('productId',x.value->>'productId',
    'variantId',coalesce(x.value->>'variantId',''),
    'quantity',(x.value->>'quantity')::integer,'sourceStoreId',v_order.store_id)
    ORDER BY x.ordinality) INTO v_lines
  FROM jsonb_array_elements(v_order.snapshot->'lines') WITH ORDINALITY x(value,ordinality);
  v_result:=public.dbk55_record_paid_pos('dbk68-daraja-'||md5(p_reference),
    jsonb_build_object('orderId',v_order.order_id,'provider','daraja',
      'providerPaymentId',v_checkout,'providerReceipt',v_receipt,
      'amountMinor',v_order.amount_minor,'currency','KES','items',v_lines));
  IF v_result->>'financialStatus'<>'PAID'
    OR v_result->>'stockStatus' NOT IN ('COMMITTED','REVIEW_REQUIRED')
  THEN RAISE EXCEPTION 'DBK-68 settlement did not persist'; END IF;
  UPDATE public.dbk68_daraja_orders
  SET payment_status='PAID',stock_status=v_result->>'stockStatus',
      receipt_number=v_receipt,paid_at=v_paid::timestamptz,result_code=0,
      result_description='Verified by Daraja STK Query',updated_at=now()
  WHERE reference=p_reference;
  RETURN jsonb_build_object('paymentStatus','PAID','stockStatus',v_result->>'stockStatus','replayed',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.dbk68_mark_failed(p_reference text,p_checkout text,p_code integer,p_description text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.dbk68_daraja_gate();
  IF p_code=0 OR p_code IS NULL THEN RAISE EXCEPTION 'Cannot fail a confirmed payment'; END IF;
  UPDATE public.dbk68_daraja_orders
    SET payment_status='FAILED',result_code=p_code,
      result_description=left(coalesce(p_description,'Provider declined'),250),updated_at=now()
  WHERE reference=p_reference AND checkout_id=p_checkout AND payment_status='PENDING';
END;
$$;

REVOKE ALL ON FUNCTION public.dbk68_daraja_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk68_create_pending(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk68_claim_stk(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk68_attach_stk(text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk68_note_callback(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk68_settle_verified(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk68_mark_failed(text,text,integer,text) FROM PUBLIC;
