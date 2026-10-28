-- DBK-54: staging-only, disabled-by-default multi-line stock transactions.
-- Requires DBK-51 schema and seed. No production POS/payment integration.
CREATE TABLE IF NOT EXISTS public.dbk54_stock_batches (
  batch_id text PRIMARY KEY,
  order_id text NOT NULL,
  batch_type text NOT NULL CHECK (batch_type IN ('SALE','RETURN')),
  request_payload jsonb NOT NULL,
  result_payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
-- Only one sale inventory deduction per order, even with a different retry key.
CREATE UNIQUE INDEX IF NOT EXISTS dbk54_one_sale_per_order_idx
  ON public.dbk54_stock_batches(order_id) WHERE batch_type = 'SALE';

CREATE OR REPLACE FUNCTION public.dbk54_apply_stock_batch(p_batch_id text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_kind text := p_payload->>'type';
  v_order text := p_payload->>'orderId';
  v_items jsonb := p_payload->'items';
  v_existing public.dbk54_stock_batches%ROWTYPE;
  v_item jsonb;
  v_product text;
  v_variant text;
  v_sold bigint;
  v_returned bigint;
  v_requested bigint;
  v_index integer := 0;
  v_id text;
  v_op jsonb;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF p_batch_id IS NULL OR length(p_batch_id) < 8 OR length(p_batch_id) > 120
     OR v_kind IS NULL OR v_kind NOT IN ('SALE','RETURN') OR nullif(v_order,'') IS NULL
     OR length(v_order) > 200 OR jsonb_typeof(v_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_items) < 1 OR jsonb_array_length(v_items) > 100 THEN
    RAISE EXCEPTION 'Invalid DBK-54 batch';
  END IF;
  -- Fail closed on unexpected keys and non-integer quantities, before any stock movement.
  IF p_payload - 'type' - 'orderId' - 'items' <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Unexpected top-level batch fields';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    IF jsonb_typeof(v_item) <> 'object'
       OR v_item - 'productId' - 'variantId' - 'quantity' - 'sourceStoreId' - 'destinationStoreId' <> '{}'::jsonb
       OR nullif(v_item->>'productId','') IS NULL
       OR v_item->>'quantity' !~ '^[1-9][0-9]*$'
       OR length(v_item->>'productId') > 200
       OR (v_kind='SALE' AND (nullif(v_item->>'sourceStoreId','') IS NULL OR v_item->>'sourceStoreId'='__UNALLOCATED__'))
       OR (v_kind='RETURN' AND (nullif(v_item->>'destinationStoreId','') IS NULL OR v_item->>'destinationStoreId'='__UNALLOCATED__')) THEN
      RAISE EXCEPTION 'Invalid DBK-54 line';
    END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk54:batch:'||p_batch_id,54));
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk54:order:'||v_order,54));
  IF NOT EXISTS (SELECT 1 FROM public.dbk51_stock_engine_config
     WHERE singleton AND writes_enabled AND seed_fingerprint IS NOT NULL) THEN
    RAISE EXCEPTION 'DBK-51 write gate is disabled';
  END IF;
  SELECT * INTO v_existing FROM public.dbk54_stock_batches WHERE batch_id=p_batch_id;
  IF FOUND THEN
    IF v_existing.request_payload <> p_payload THEN
      RAISE EXCEPTION 'Batch idempotency key reused with changed payload';
    END IF;
    RETURN v_existing.result_payload || jsonb_build_object('replayed',true);
  END IF;
  IF v_kind='SALE' AND EXISTS (
    SELECT 1 FROM public.dbk54_stock_batches WHERE order_id=v_order AND batch_type='SALE'
  ) THEN
    RAISE EXCEPTION 'Order stock has already been deducted';
  END IF;
  -- Never create stock from unsupported or excessive refunds. Only orders
  -- already sold through THIS Neon batch engine can be returned here.
  -- Order advisory lock above serializes concurrent partial returns.
  IF v_kind='RETURN' THEN
    IF NOT EXISTS (SELECT 1 FROM public.dbk54_stock_batches
      WHERE order_id=v_order AND batch_type='SALE') THEN
      RAISE EXCEPTION 'Cannot return stock for an unregistered Neon sale';
    END IF;
    FOR v_product IN SELECT DISTINCT value->>'productId' FROM jsonb_array_elements(v_items) LOOP
      FOR v_variant IN SELECT DISTINCT coalesce(value->>'variantId','')
          FROM jsonb_array_elements(v_items) WHERE value->>'productId'=v_product LOOP
        SELECT coalesce(sum((line.value->>'quantity')::bigint),0) INTO v_sold
          FROM public.dbk54_stock_batches b CROSS JOIN LATERAL
            jsonb_array_elements(b.request_payload->'items') AS line(value)
          WHERE b.order_id=v_order AND b.batch_type='SALE'
            AND line.value->>'productId'=v_product
            AND coalesce(line.value->>'variantId','')=v_variant;
        SELECT coalesce(sum((line.value->>'quantity')::bigint),0) INTO v_returned
          FROM public.dbk54_stock_batches b CROSS JOIN LATERAL
            jsonb_array_elements(b.request_payload->'items') AS line(value)
          WHERE b.order_id=v_order AND b.batch_type='RETURN'
            AND line.value->>'productId'=v_product
            AND coalesce(line.value->>'variantId','')=v_variant;
        SELECT coalesce(sum((line.value->>'quantity')::bigint),0) INTO v_requested
          FROM jsonb_array_elements(v_items) AS line(value)
          WHERE line.value->>'productId'=v_product
            AND coalesce(line.value->>'variantId','')=v_variant;
        IF v_requested + v_returned > v_sold THEN
          RAISE EXCEPTION 'Return quantity exceeds sold quantity';
        END IF;
      END LOOP;
    END LOOP;
  END IF;
  -- Sorted locks prevent deadlocks for baskets containing the same products in
  -- opposite orders. These are the same product locks used by DBK-51.
  FOR v_product IN SELECT DISTINCT value->>'productId' FROM jsonb_array_elements(v_items)
     ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('dbk51:'||v_product,51));
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_index := v_index + 1;
    v_id := 'dbk54-' || md5(p_batch_id) || '-' || lpad(v_index::text,3,'0');
    v_op := jsonb_build_object(
      'type',v_kind,'orderId',v_order,'productId',v_item->>'productId',
      'variantId',coalesce(v_item->>'variantId',''),
      'quantity',(v_item->>'quantity')::bigint
    );
    IF v_kind='SALE' THEN
      v_op := v_op || jsonb_build_object('sourceStoreId',v_item->>'sourceStoreId');
    ELSE
      v_op := v_op || jsonb_build_object('destinationStoreId',v_item->>'destinationStoreId');
    END IF;
    v_result := public.dbk51_apply_stock(v_id,v_op);
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;
  v_result := jsonb_build_object('batchId',p_batch_id,'type',v_kind,'orderId',v_order,
    'lineCount',v_index,'operations',v_results,'replayed',false);
  INSERT INTO public.dbk54_stock_batches(batch_id,order_id,batch_type,request_payload,result_payload)
    VALUES(p_batch_id,v_order,v_kind,p_payload,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.dbk54_apply_stock_batch(text,jsonb) FROM PUBLIC;
