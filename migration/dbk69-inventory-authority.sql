-- DBK-69: inventory administration on the already seeded DBK-51 ledger.
-- Requires DBK-51. All application and database write switches remain OFF by default.
-- Install on dbk51-test first. Does not migrate/seed or modify existing stock.
CREATE TABLE IF NOT EXISTS public.dbk69_inventory_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk69_inventory_config(singleton,enabled) VALUES(true,false)
  ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dbk69_inventory_movements (
  operation_id text PRIMARY KEY,
  request_payload jsonb NOT NULL,
  metadata jsonb NOT NULL,
  result_payload jsonb NOT NULL,
  product_id text NOT NULL,
  variant_id text NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('PURCHASE','RECEIVE','TRANSFER')),
  quantity bigint NOT NULL CHECK (quantity > 0),
  actor_id text NOT NULL,
  actor_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dbk69_inventory_movements_recent_idx
  ON public.dbk69_inventory_movements(created_at DESC,operation_id DESC);

CREATE OR REPLACE FUNCTION public.dbk69_apply_inventory(p_id text,p_payload jsonb,p_meta jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_existing public.dbk69_inventory_movements%ROWTYPE;
  v_result jsonb;
  v_stock jsonb;
  v_destination text := p_payload->>'destinationStoreId';
  v_variant text := coalesce(p_payload->>'variantId','');
  v_location_on_hand bigint;
  v_location_incoming bigint;
BEGIN
  IF p_id IS NULL OR length(p_id) < 12 OR length(p_id) > 140
     OR p_payload->>'type' NOT IN ('PURCHASE','RECEIVE','TRANSFER')
     OR jsonb_typeof(p_meta) IS DISTINCT FROM 'object'
     OR nullif(p_meta->>'actorId','') IS NULL
     OR nullif(p_meta->>'actorName','') IS NULL
     OR nullif(p_meta->>'productName','') IS NULL
     OR length(coalesce(p_meta->>'note','')) > 500
     OR length(coalesce(p_meta->>'actorId','')) > 200
     OR length(coalesce(p_meta->>'actorName','')) > 200
     OR length(coalesce(p_meta->>'productName','')) > 250
     OR p_meta->>'unitCost' !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'Invalid DBK-69 operation or metadata';
  END IF;
  -- This lock serializes retries of one operation before checking for a prior success.
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk69:'||p_id,69));
  IF NOT EXISTS (SELECT 1 FROM public.dbk69_inventory_config WHERE singleton AND enabled)
     OR NOT EXISTS (SELECT 1 FROM public.dbk51_stock_engine_config WHERE singleton AND writes_enabled AND seed_fingerprint IS NOT NULL) THEN
    RAISE EXCEPTION 'DBK-69 inventory write gate disabled';
  END IF;
  SELECT * INTO v_existing FROM public.dbk69_inventory_movements WHERE operation_id=p_id;
  IF FOUND THEN
    IF v_existing.request_payload <> p_payload OR v_existing.metadata <> p_meta THEN
      RAISE EXCEPTION 'Inventory retry key reused for a different operation';
    END IF;
    RETURN v_existing.result_payload || jsonb_build_object('replayed',true);
  END IF;
  -- This call and the audit insert are ONE PostgreSQL transaction. No Sanity mutation.
  v_stock := public.dbk51_apply_stock(p_id,p_payload);
  SELECT on_hand,incoming INTO v_location_on_hand,v_location_incoming
    FROM public.dbk51_stock_balances
    WHERE product_id=p_payload->>'productId' AND variant_id=v_variant AND location_id=v_destination;
  v_result := v_stock || jsonb_build_object(
    'movementId','dbk69.'||p_id,'stockAfter',v_location_on_hand,
    'incomingAfter',v_location_incoming,
    'locationOnHand',v_location_on_hand,'locationIncoming',v_location_incoming,
    'replayed',false);
  INSERT INTO public.dbk69_inventory_movements
    (operation_id,request_payload,metadata,result_payload,product_id,variant_id,movement_type,quantity,actor_id,actor_name)
  VALUES(p_id,p_payload,p_meta,v_result,p_payload->>'productId',v_variant,
    p_payload->>'type',(p_payload->>'quantity')::bigint,p_meta->>'actorId',p_meta->>'actorName');
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.dbk69_apply_inventory(text,jsonb,jsonb) FROM PUBLIC;
