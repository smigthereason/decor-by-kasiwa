-- DBK-64: GATED ONLINE PAYSTACK CHECKOUT (production schema preparation only).
-- NEVER enable gates before inventory snapshot, complete writer cutover,
-- operations/read compatibility, provider reconciliation and rollback tests.
-- Requires DBK-51/54/55 and DBK-62 cutover schema. All defaults are OFF.
CREATE TABLE IF NOT EXISTS public.dbk64_online_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk64_online_config(singleton,enabled) VALUES(true,false)
ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dbk64_online_orders (
  reference text PRIMARY KEY,
  order_id text NOT NULL UNIQUE,
  order_number text NOT NULL UNIQUE,
  store_id text NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=1000000000000),
  currency text NOT NULL DEFAULT 'KES' CHECK(currency='KES'),
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  payment_status text NOT NULL DEFAULT 'PENDING'
    CHECK(payment_status IN ('PENDING','INIT_FAILED','PAID')),
  stock_status text NOT NULL DEFAULT 'NOT_ATTEMPTED'
    CHECK(stock_status IN ('NOT_ATTEMPTED','COMMITTED','REVIEW_REQUIRED')),
  provider_transaction_id text UNIQUE,
  verified_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS dbk64_online_orders_created_idx ON public.dbk64_online_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS dbk64_online_review_idx ON public.dbk64_online_orders(payment_status,stock_status);

CREATE OR REPLACE FUNCTION public.dbk64_online_gate() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.dbk64_online_config x
    JOIN public.dbk62_cutover_config c ON c.singleton=x.singleton
    JOIN public.dbk55_settlement_config p ON p.singleton=x.singleton
    JOIN public.dbk51_stock_engine_config s ON s.singleton=x.singleton
    WHERE x.singleton AND x.enabled AND c.enabled AND p.enabled
      AND c.sanity_stock_frozen AND c.all_stock_writers_switched
      AND c.provider_callbacks_ready AND c.receivables_ready
      AND c.refunds_ready AND c.reports_ready
      AND c.reconciliation_fingerprint IS NOT NULL
      AND length(c.reconciliation_fingerprint)>=32
      AND c.reconciliation_fingerprint=s.seed_fingerprint
      AND s.writes_enabled
  ) THEN RAISE EXCEPTION 'DBK-64 online Paystack settlement cutover is disabled'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.dbk64_create_pending_checkout(p_reference text, p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_line jsonb;
  v_existing public.dbk64_online_orders%ROWTYPE;
  v_amount text:=p_snapshot->>'totalMinor';
  v_subtotal text:=p_snapshot->>'subtotalMinor';
  v_delivery text:=p_snapshot->>'deliveryMinor';
  v_line_total numeric:=0;
BEGIN
  PERFORM public.dbk64_online_gate();
  IF p_reference IS NULL OR p_reference !~ '^DBK64-[0-9]{10,15}-[a-f0-9]{10}$'
    OR jsonb_typeof(p_snapshot) IS DISTINCT FROM 'object'
    OR (p_snapshot - 'orderId' - 'orderNumber' - 'reference' - 'storeId' - 'storeName'
      - 'customerName' - 'customerEmail' - 'customerPhone' - 'paymentChannel'
      - 'subtotalMinor' - 'deliveryMinor' - 'totalMinor' - 'deliveryAddress'
      - 'deliveryLocation' - 'lines') <> '{}'::jsonb
    OR p_snapshot->>'reference' IS DISTINCT FROM p_reference
    OR p_snapshot->>'orderId' IS DISTINCT FROM 'dbk64.order.'||p_reference
    OR coalesce(p_snapshot->>'orderNumber','') !~ '^DBK-COM-[A-Za-z0-9-]{6,80}$'
    OR coalesce(p_snapshot->>'storeId','') = ''
    OR coalesce(p_snapshot->>'customerEmail','') = ''
    OR coalesce(p_snapshot->>'customerName','') = ''
    OR coalesce(v_amount,'') !~ '^[1-9][0-9]*$' OR length(v_amount)>13
    OR coalesce(v_subtotal,'') !~ '^(0|[1-9][0-9]*)$' OR length(v_subtotal)>13
    OR coalesce(v_delivery,'') !~ '^(0|[1-9][0-9]*)$' OR length(v_delivery)>13
    OR jsonb_typeof(p_snapshot->'totalMinor') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_snapshot->'subtotalMinor') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_snapshot->'deliveryMinor') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_snapshot->'deliveryAddress') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_snapshot->'lines') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_snapshot->'lines') NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'Invalid DBK-64 pending checkout contract'; END IF;
  IF v_amount::numeric>1000000000000
    OR v_subtotal::numeric+v_delivery::numeric<>v_amount::numeric
  THEN RAISE EXCEPTION 'DBK-64 order monetary totals invalid'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_snapshot->'lines') LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
      OR (v_line - 'productId' - 'variantId' - 'quantity' - 'unitPriceMinor'
         - 'name' - 'finish' - 'size') <> '{}'::jsonb
      OR coalesce(v_line->>'productId','') = ''
      OR v_line->>'variantId'='__UNALLOCATED_VARIANT__'
      OR coalesce(v_line->>'quantity','') !~ '^[1-9][0-9]*$'
      OR coalesce(v_line->>'unitPriceMinor','') !~ '^[1-9][0-9]*$'
      OR jsonb_typeof(v_line->'quantity') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_line->'unitPriceMinor') IS DISTINCT FROM 'number'
      OR length(v_line->>'quantity')>9
      OR length(v_line->>'unitPriceMinor')>13
    THEN RAISE EXCEPTION 'Invalid DBK-64 checkout line'; END IF;
    v_line_total:=v_line_total + (v_line->>'quantity')::numeric * (v_line->>'unitPriceMinor')::numeric;
  END LOOP;
  IF v_line_total<>v_subtotal::numeric THEN
    RAISE EXCEPTION 'DBK-64 line items do not match authoritative subtotal'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk64:'||p_reference,64));
  SELECT * INTO v_existing FROM public.dbk64_online_orders WHERE reference=p_reference FOR UPDATE;
  IF FOUND THEN
    IF v_existing.snapshot<>p_snapshot THEN RAISE EXCEPTION 'Conflicting DBK-64 checkout replay'; END IF;
    RETURN jsonb_build_object('created',false,'status',v_existing.payment_status);
  END IF;
  INSERT INTO public.dbk64_online_orders(reference,order_id,order_number,store_id,amount_minor,snapshot)
    VALUES(p_reference,p_snapshot->>'orderId',p_snapshot->>'orderNumber',p_snapshot->>'storeId',v_amount::bigint,p_snapshot);
  RETURN jsonb_build_object('created',true,'status','PENDING');
END;
$$;

CREATE OR REPLACE FUNCTION public.dbk64_finalize_verified_checkout(p_reference text,p_verified jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_order public.dbk64_online_orders%ROWTYPE;
  v_provider_id text:=p_verified->>'id';
  v_amount text:=p_verified->>'amountMinor';
  v_stock jsonb;
  v_lines jsonb;
  v_settlement jsonb;
BEGIN
  PERFORM public.dbk64_online_gate();
  IF p_reference IS NULL OR p_reference !~ '^DBK64-[0-9]{10,15}-[a-f0-9]{10}$'
    OR jsonb_typeof(p_verified) IS DISTINCT FROM 'object'
    OR (p_verified - 'reference' - 'id' - 'amountMinor' - 'currency' - 'paidAt' - 'channel') <> '{}'::jsonb
    OR p_verified->>'reference' IS DISTINCT FROM p_reference
    OR coalesce(v_provider_id,'') !~ '^[0-9]{1,30}$'
    OR coalesce(v_amount,'') !~ '^[1-9][0-9]*$' OR length(v_amount)>13
    OR jsonb_typeof(p_verified->'amountMinor') IS DISTINCT FROM 'number'
    OR p_verified->>'currency' IS DISTINCT FROM 'KES'
    OR coalesce(p_verified->>'paidAt','') = ''
    OR length(p_verified->>'paidAt')>60
  THEN RAISE EXCEPTION 'Invalid DBK-64 verified Paystack evidence'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk64:'||p_reference,64));
  SELECT * INTO v_order FROM public.dbk64_online_orders WHERE reference=p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown DBK-64 online order'; END IF;
  IF v_order.amount_minor<>v_amount::bigint THEN
    RAISE EXCEPTION 'Verified Paystack amount does not match pending order'; END IF;
  IF v_order.payment_status='PAID' THEN
    IF v_order.provider_transaction_id<>v_provider_id OR
       v_order.verified_payload->>'amountMinor'<>v_amount OR
       v_order.verified_payload->>'reference'<>p_reference
    THEN RAISE EXCEPTION 'Conflicting DBK-64 paid-order replay'; END IF;
    RETURN jsonb_build_object('paymentStatus','PAID','stockStatus',v_order.stock_status,'replayed',true);
  END IF;
  SELECT jsonb_agg(jsonb_build_object('productId',item.value->>'productId',
    'variantId',coalesce(item.value->>'variantId',''),
    'quantity',(item.value->>'quantity')::integer,'sourceStoreId',v_order.store_id)
    ORDER BY item.ordinality) INTO v_lines
    FROM jsonb_array_elements(v_order.snapshot->'lines') WITH ORDINALITY item(value,ordinality);
  IF v_lines IS NULL THEN RAISE EXCEPTION 'DBK-64 paid order has no stock lines'; END IF;
  -- DBK-55 records confirmed financial truth first; failed stock is saved as REVIEW_REQUIRED,
  -- not silently discarded. Duplicate provider transaction IDs are globally rejected there.
  v_settlement:=public.dbk55_record_paid_pos('dbk64-paystack-'||md5(p_reference),
    jsonb_build_object('orderId',v_order.order_id,'provider','paystack',
      'providerPaymentId',v_provider_id,'providerReceipt',v_provider_id,
      'amountMinor',v_order.amount_minor,'currency','KES','items',v_lines));
  IF v_settlement->>'financialStatus' IS DISTINCT FROM 'PAID'
    OR v_settlement->>'stockStatus' NOT IN ('COMMITTED','REVIEW_REQUIRED')
  THEN RAISE EXCEPTION 'DBK-64 paid settlement did not persist'; END IF;
  UPDATE public.dbk64_online_orders
    SET payment_status='PAID',stock_status=v_settlement->>'stockStatus',
      provider_transaction_id=v_provider_id,verified_payload=p_verified,
      paid_at=(p_verified->>'paidAt')::timestamptz,updated_at=now()
    WHERE reference=p_reference;
  RETURN jsonb_build_object('paymentStatus','PAID','stockStatus',v_settlement->>'stockStatus','replayed',false);
END;
$$;

REVOKE ALL ON FUNCTION public.dbk64_online_gate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk64_create_pending_checkout(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk64_finalize_verified_checkout(text,jsonb) FROM PUBLIC;
