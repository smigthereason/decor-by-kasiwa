-- DBK-60: ISOLATED dbk51-test DATABASE ONLY.
-- DO NOT INSTALL ON PRODUCTION. No real payment is processed or confirmed.
-- Uses DBK-57 atomic order+stock+payment; all persistent changes are confined to the test branch.
CREATE TABLE IF NOT EXISTS public.dbk60_staged_manual_sales (
  order_id text PRIMARY KEY REFERENCES public.dbk56_pos_orders(order_id) ON DELETE RESTRICT,
  request_key text NOT NULL UNIQUE REFERENCES public.dbk57_manual_sales(request_key) ON DELETE RESTRICT,
  display_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(display_snapshot) = 'object')
);

CREATE OR REPLACE FUNCTION public.dbk60_stage_test_manual_sale(
  p_request_key text, p_payload jsonb, p_display jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_order_id text := p_payload->'order'->>'orderId';
  v_existing public.dbk60_staged_manual_sales%ROWTYPE;
  v_original jsonb;
  v_result jsonb;
  v_stock_gate boolean;
  v_ledger_gate boolean;
  v_manual_gate boolean;
  v_settlement_gate boolean;
BEGIN
  -- The caller is restricted to the pinned test connection in application code;
  -- SQL independently rejects non-synthetic order/payment evidence.
  IF p_request_key IS NULL OR p_request_key !~ '^dbk58-manual-[0-9a-f]{24}$'
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_payload->'cashierConfirmed' IS DISTINCT FROM 'true'::jsonb
     OR coalesce(v_order_id,'') !~ '^dbk58[.]order[.][0-9a-f]{24}$'
     OR coalesce(p_payload->'order'->>'orderNumber','') !~ '^DBK58-TEST-[0-9a-f]{24}$'
     OR coalesce(p_payload->'order'->>'channel','') <> 'POS'
     OR coalesce(p_payload->'payment'->>'provider','') <> 'manual'
     OR coalesce(p_payload->'payment'->>'purpose','') <> 'INITIAL'
     OR coalesce(p_payload->'payment'->>'providerReference','') !~ '^DBK58-TEST-[A-Z0-9-]{5,64}$'
     OR coalesce(p_payload->'payment'->>'evidenceReference','') !~ '^synthetic-[0-9a-f]{24}$'
     OR jsonb_typeof(p_display) IS DISTINCT FROM 'object'
     OR p_display - 'storeName' - 'sellerName' - 'productNames' <> '{}'::jsonb
     OR jsonb_typeof(p_display->'productNames') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_display->'productNames') NOT BETWEEN 1 AND 100
     OR length(coalesce(p_display->>'storeName','')) NOT BETWEEN 1 AND 120
     OR length(coalesce(p_display->>'sellerName','')) NOT BETWEEN 1 AND 120
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_display->'productNames') AS n(value)
       WHERE jsonb_typeof(n.value) <> 'string' OR length(n.value #>> '{}') NOT BETWEEN 1 AND 160
     )
     OR jsonb_array_length(p_display->'productNames') <> jsonb_array_length(p_payload->'order'->'items')
  THEN RAISE EXCEPTION 'DBK-60 accepts only validated synthetic preview payloads'; END IF;

  -- Both DBK-59 rollback exercise and DBK-60 persistent staging serialize on the same gate lock.
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk59:rollback-only',59));
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk60:request:' || p_request_key,60));

  -- First handle idempotent replay *without* enabling gates or changing stock.
  SELECT * INTO v_existing FROM public.dbk60_staged_manual_sales
    WHERE request_key=p_request_key FOR UPDATE;
  IF FOUND THEN
    SELECT original_payload INTO v_original FROM public.dbk57_manual_sales
      WHERE request_key=p_request_key;
    IF v_existing.order_id <> v_order_id OR v_original IS DISTINCT FROM p_payload
       OR v_existing.display_snapshot <> p_display
    THEN RAISE EXCEPTION 'Conflicting DBK-60 request replay'; END IF;
    SELECT result_payload INTO v_result FROM public.dbk57_manual_sales
      WHERE request_key=p_request_key;
    RETURN v_result || jsonb_build_object('replayed',true,'stageOnly',true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.dbk57_manual_sales WHERE request_key=p_request_key)
  THEN RAISE EXCEPTION 'Existing DBK-57 sale is not a DBK-60 staged sale'; END IF;

  SELECT writes_enabled INTO v_stock_gate
    FROM public.dbk51_stock_engine_config WHERE singleton FOR UPDATE;
  SELECT enabled INTO v_ledger_gate
    FROM public.dbk56_ledger_config WHERE singleton FOR UPDATE;
  SELECT enabled INTO v_manual_gate
    FROM public.dbk57_manual_sale_config WHERE singleton FOR UPDATE;
  SELECT enabled INTO v_settlement_gate
    FROM public.dbk55_settlement_config WHERE singleton FOR UPDATE;
  IF v_stock_gate IS DISTINCT FROM false OR v_ledger_gate IS DISTINCT FROM false
     OR v_manual_gate IS DISTINCT FROM false OR v_settlement_gate IS DISTINCT FROM false
     OR NOT EXISTS(SELECT 1 FROM public.dbk51_stock_engine_config
                   WHERE singleton AND seed_fingerprint IS NOT NULL)
  THEN RAISE EXCEPTION 'DBK-60 requires seeded TEST stock and every write gate OFF'; END IF;

  -- One PostgreSQL statement / transaction. Uncommitted gate changes are invisible
  -- to other database connections. Any child failure aborts all stock/payment/order writes.
  UPDATE public.dbk51_stock_engine_config SET writes_enabled=true,updated_at=now() WHERE singleton;
  UPDATE public.dbk56_ledger_config SET enabled=true,updated_at=now() WHERE singleton;
  UPDATE public.dbk57_manual_sale_config SET enabled=true,updated_at=now() WHERE singleton;

  v_result := public.dbk57_record_manual_sale(p_request_key,p_payload);
  IF v_result->>'stockCommitted' IS DISTINCT FROM 'true'
     OR v_result->>'replayed' IS DISTINCT FROM 'false'
  THEN RAISE EXCEPTION 'DBK-60 did not create a fresh test-only sale'; END IF;

  INSERT INTO public.dbk60_staged_manual_sales(order_id,request_key,display_snapshot)
    VALUES (v_order_id,p_request_key,p_display);

  UPDATE public.dbk57_manual_sale_config SET enabled=false,updated_at=now() WHERE singleton;
  UPDATE public.dbk56_ledger_config SET enabled=false,updated_at=now() WHERE singleton;
  UPDATE public.dbk51_stock_engine_config SET writes_enabled=false,updated_at=now() WHERE singleton;
  RETURN v_result || jsonb_build_object('stageOnly',true,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.dbk60_stage_test_manual_sale(text,jsonb,jsonb) FROM PUBLIC;
