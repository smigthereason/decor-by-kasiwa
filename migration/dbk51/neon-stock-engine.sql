-- DBK-51: Disabled-by-default Neon inventory transaction engine.
-- Create-only: does not modify Sanity, existing Neon archives, orders or payments.
CREATE TABLE IF NOT EXISTS public.dbk51_stock_engine_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  writes_enabled boolean NOT NULL DEFAULT false,
  seed_fingerprint text,
  seed_created_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk51_stock_engine_config(singleton, writes_enabled)
VALUES(true, false) ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dbk51_stock_balances (
  product_id text NOT NULL,
  variant_id text NOT NULL DEFAULT '',
  location_id text NOT NULL,
  on_hand bigint NOT NULL DEFAULT 0 CHECK(on_hand >= 0),
  incoming bigint NOT NULL DEFAULT 0 CHECK(incoming >= 0),
  product_revision text NOT NULL,
  inventory_revision text NOT NULL,
  seed_fingerprint text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(product_id, variant_id, location_id),
  CHECK(product_id <> '' AND location_id <> '')
);
CREATE INDEX IF NOT EXISTS dbk51_stock_balances_store_idx
  ON public.dbk51_stock_balances(location_id, product_id);

CREATE TABLE IF NOT EXISTS public.dbk51_stock_operations (
  operation_id text PRIMARY KEY,
  product_id text NOT NULL,
  variant_id text NOT NULL,
  operation_type text NOT NULL CHECK(operation_type IN ('PURCHASE','RECEIVE','TRANSFER','SALE','RETURN')),
  request_payload jsonb NOT NULL,
  result_payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dbk51_stock_operations_product_idx
  ON public.dbk51_stock_operations(product_id, recorded_at);

-- Exactly one initial seed. No stock transactions or second import may exist.
-- The caller must independently validate snapshot quantities/revisions and fingerprint.
CREATE OR REPLACE FUNCTION public.dbk51_seed_stock(p_fingerprint text, p_rows jsonb, p_expected_rows integer)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk51-seed', 51));
  IF p_fingerprint !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_rows) <> 'array'
    OR p_expected_rows < 1 OR p_expected_rows > 200000
    OR jsonb_array_length(p_rows) <> p_expected_rows THEN
    RAISE EXCEPTION 'Invalid seed payload/count';
  END IF;
  IF EXISTS(SELECT 1 FROM public.dbk51_stock_balances)
    OR EXISTS(SELECT 1 FROM public.dbk51_stock_operations)
    OR (SELECT seed_fingerprint FROM public.dbk51_stock_engine_config WHERE singleton) IS NOT NULL THEN
    RAISE EXCEPTION 'Stock engine already initialized; refusing overwrite';
  END IF;
  -- Deduplicate and validate before any writes.
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(product_id text, variant_id text, location_id text,
        on_hand bigint, incoming bigint, product_revision text, inventory_revision text)
    WHERE nullif(r.product_id,'') IS NULL OR r.variant_id IS NULL OR nullif(r.location_id,'') IS NULL
      OR r.on_hand IS NULL OR r.on_hand < 0 OR r.incoming IS NULL OR r.incoming < 0
      OR r.product_revision IS NULL OR r.inventory_revision IS NULL
  ) THEN RAISE EXCEPTION 'Invalid inventory row'; END IF;
  IF (SELECT count(DISTINCT (product_id,variant_id,location_id))
      FROM jsonb_to_recordset(p_rows) AS r(product_id text, variant_id text, location_id text)) <> p_expected_rows THEN
    RAISE EXCEPTION 'Duplicate inventory keys';
  END IF;
  INSERT INTO public.dbk51_stock_balances
    (product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
  SELECT product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,p_fingerprint
  FROM jsonb_to_recordset(p_rows) AS r(product_id text, variant_id text, location_id text,
      on_hand bigint, incoming bigint, product_revision text, inventory_revision text);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> p_expected_rows THEN RAISE EXCEPTION 'Seed count mismatch'; END IF;
  UPDATE public.dbk51_stock_engine_config SET seed_fingerprint = p_fingerprint, seed_created_at=now(), updated_at=now()
    WHERE singleton;
  RETURN jsonb_build_object('seeded',n,'fingerprint',p_fingerprint,'writesEnabled',false);
END;
$$;

-- Single PostgreSQL transaction per operation. Product-level advisory locks serialize
-- checkout/receipt/transfer of the same product (including variants).
-- NOT enabled on production until all POS/payment/order read/write paths are migrated.
CREATE OR REPLACE FUNCTION public.dbk51_apply_stock(p_operation_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_type text := p_payload->>'type';
  v_product text := p_payload->>'productId';
  v_variant text := coalesce(p_payload->>'variantId','');
  v_source text := p_payload->>'sourceStoreId';
  v_dest text := p_payload->>'destinationStoreId';
  v_quantity bigint;
  v_existing public.dbk51_stock_operations%ROWTYPE;
  v_result jsonb;
  v_count integer;
BEGIN
  IF p_operation_id IS NULL OR length(p_operation_id) < 8 OR length(p_operation_id) > 200
    OR v_product IS NULL OR v_product = '' OR v_type IS NULL OR v_type NOT IN ('PURCHASE','RECEIVE','TRANSFER','SALE','RETURN')
    OR p_payload->>'quantity' !~ '^[1-9][0-9]*$' THEN
    RAISE EXCEPTION 'Invalid stock operation payload';
  END IF;
  v_quantity := (p_payload->>'quantity')::bigint;
  IF v_quantity > 1000000000 THEN RAISE EXCEPTION 'Quantity limit exceeded'; END IF;
  IF v_variant = '__UNALLOCATED_VARIANT__' THEN RAISE EXCEPTION 'Unknown variant stock cannot be transacted'; END IF;
  IF (v_type IN ('PURCHASE','RECEIVE','RETURN') AND nullif(v_dest,'') IS NULL)
    OR (v_type = 'SALE' AND (nullif(v_source,'') IS NULL OR v_source = '__UNALLOCATED__'))
    OR (v_type = 'TRANSFER' AND (nullif(v_source,'') IS NULL OR nullif(v_dest,'') IS NULL OR v_source = v_dest)) THEN
    RAISE EXCEPTION 'Invalid source/destination';
  END IF;
  IF v_type IN ('SALE','RETURN') AND nullif(p_payload->>'orderId','') IS NULL THEN
    RAISE EXCEPTION 'Order ID required for sale/refund operation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk51:'||v_product,51));
  IF NOT EXISTS(SELECT 1 FROM public.dbk51_stock_engine_config WHERE singleton AND writes_enabled AND seed_fingerprint IS NOT NULL) THEN
    RAISE EXCEPTION 'DBK-51 write gate is disabled';
  END IF;
  SELECT * INTO v_existing FROM public.dbk51_stock_operations WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_existing.request_payload <> p_payload THEN RAISE EXCEPTION 'Idempotency key reused with different payload'; END IF;
    RETURN v_existing.result_payload || jsonb_build_object('replayed',true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dbk51_stock_balances WHERE product_id=v_product AND variant_id=v_variant) THEN
    RAISE EXCEPTION 'Product/variant is absent from seeded stock';
  END IF;
  IF v_type IN ('PURCHASE','RECEIVE','RETURN','TRANSFER') THEN
    INSERT INTO public.dbk51_stock_balances(product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
    SELECT v_product,v_variant,v_dest,0,0,product_revision,inventory_revision,seed_fingerprint
    FROM public.dbk51_stock_balances WHERE product_id=v_product AND variant_id=v_variant
    ORDER BY location_id LIMIT 1 ON CONFLICT DO NOTHING;
  END IF;
  IF v_type = 'PURCHASE' THEN
    UPDATE public.dbk51_stock_balances SET incoming=incoming+v_quantity,updated_at=now()
      WHERE product_id=v_product AND variant_id=v_variant AND location_id=v_dest;
  ELSIF v_type = 'RECEIVE' THEN
    UPDATE public.dbk51_stock_balances SET incoming=incoming-v_quantity,on_hand=on_hand+v_quantity,updated_at=now()
      WHERE product_id=v_product AND variant_id=v_variant AND location_id=v_dest AND incoming>=v_quantity;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count<>1 THEN RAISE EXCEPTION 'Insufficient purchased/incoming stock'; END IF;
  ELSIF v_type IN ('SALE','TRANSFER') THEN
    UPDATE public.dbk51_stock_balances SET on_hand=on_hand-v_quantity,updated_at=now()
      WHERE product_id=v_product AND variant_id=v_variant AND location_id=v_source AND on_hand>=v_quantity;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count<>1 THEN RAISE EXCEPTION 'Insufficient stock at source location'; END IF;
    IF v_type = 'TRANSFER' THEN
      UPDATE public.dbk51_stock_balances SET on_hand=on_hand+v_quantity,updated_at=now()
        WHERE product_id=v_product AND variant_id=v_variant AND location_id=v_dest;
    END IF;
  ELSIF v_type = 'RETURN' THEN
    UPDATE public.dbk51_stock_balances SET on_hand=on_hand+v_quantity,updated_at=now()
      WHERE product_id=v_product AND variant_id=v_variant AND location_id=v_dest;
  END IF;
  v_result := jsonb_build_object('operationId',p_operation_id,'type',v_type,'productId',v_product,
    'variantId',v_variant,'quantity',v_quantity,'sourceStoreId',v_source,'destinationStoreId',v_dest,
    'replayed',false);
  INSERT INTO public.dbk51_stock_operations(operation_id,product_id,variant_id,operation_type,request_payload,result_payload)
    VALUES(p_operation_id,v_product,v_variant,v_type,p_payload,v_result);
  RETURN v_result;
END;
$$;

-- No GRANT to anon/authenticated roles; use the backend's server-side DATABASE_URL only.
REVOKE ALL ON FUNCTION public.dbk51_seed_stock(text,jsonb,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk51_apply_stock(text,jsonb) FROM PUBLIC;
