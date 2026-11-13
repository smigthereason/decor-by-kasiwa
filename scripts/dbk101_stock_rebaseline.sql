-- DBK-101: one-time, revision-checked production stock rebaseline.
-- Run only through the guarded JS utility. All destructive changes happen inside
-- a single PostgreSQL transaction (function call) after an immutable backup.
-- DBK101_STATEMENT
CREATE TABLE IF NOT EXISTS public.dbk101_stock_rebaseline_backups (
  rebaseline_id text PRIMARY KEY,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source_revision_fingerprint text NOT NULL,
  original_seed_fingerprint text NOT NULL,
  replacement_seed_fingerprint text NOT NULL,
  original_engine_config jsonb NOT NULL,
  original_cutover_config jsonb NOT NULL,
  original_balances jsonb NOT NULL,
  replacement_balances jsonb NOT NULL,
  old_row_count integer NOT NULL,
  new_row_count integer NOT NULL
);
-- DBK101_STATEMENT
REVOKE ALL ON public.dbk101_stock_rebaseline_backups FROM PUBLIC;

-- DBK101_STATEMENT
CREATE OR REPLACE FUNCTION public.dbk101_rebaseline_stock(
  p_rebaseline_id text,
  p_source_revision_fingerprint text,
  p_expected_old_fingerprint text,
  p_new_fingerprint text,
  p_expected_old_count integer,
  p_expected_old_rows jsonb,
  p_rows jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_engine public.dbk51_stock_engine_config%ROWTYPE;
  v_cutover public.dbk62_cutover_config%ROWTYPE;
  v_old_rows jsonb;
  v_rows integer;
  v_inserted integer;
  v_old_count integer;
BEGIN
  -- Serialize against the legacy seed function and other rebaseline operations.
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk51-seed',51));
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk101-rebaseline',101));
  LOCK TABLE public.dbk51_stock_balances IN ACCESS EXCLUSIVE MODE;
  SELECT * INTO v_engine FROM public.dbk51_stock_engine_config WHERE singleton FOR UPDATE;
  SELECT * INTO v_cutover FROM public.dbk62_cutover_config WHERE singleton FOR UPDATE;
  IF NOT FOUND OR v_engine.singleton IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Missing required stock/cutover configuration';
  END IF;

  IF p_rebaseline_id !~ '^dbk101-[a-f0-9]{24}$'
     OR p_source_revision_fingerprint !~ '^[a-f0-9]{64}$'
     OR p_new_fingerprint !~ '^[a-f0-9]{64}$'
     OR p_expected_old_fingerprint !~ '^[a-f0-9]{64}$'
     OR p_expected_old_count < 1
     OR p_expected_old_count > 200000
     OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) < 1
     OR jsonb_array_length(p_rows) > 200000 THEN
    RAISE EXCEPTION 'Invalid DBK-101 request';
  END IF;

  IF v_engine.writes_enabled OR v_cutover.enabled
     OR v_engine.seed_fingerprint IS DISTINCT FROM p_expected_old_fingerprint THEN
    RAISE EXCEPTION 'Stock gate/fingerprint changed; no rebaseline';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dbk51_stock_operations)
     OR EXISTS (SELECT 1 FROM public.dbk54_stock_batches)
     OR EXISTS (SELECT 1 FROM public.dbk56_pos_orders)
     OR EXISTS (SELECT 1 FROM public.dbk56_pos_payments)
     OR EXISTS (SELECT 1 FROM public.dbk62_manual_sales)
     OR EXISTS (SELECT 1 FROM public.dbk68_daraja_orders)
     OR EXISTS (SELECT 1 FROM public.dbk69_inventory_movements)
  THEN RAISE EXCEPTION 'Neon transaction/order/stock records exist; cannot rebaseline a used ledger'; END IF;
  IF EXISTS (SELECT 1 FROM public.dbk101_stock_rebaseline_backups) THEN
    RAISE EXCEPTION 'A rebaseline was already recorded; this operation is one-time';
  END IF;

  SELECT count(*) INTO v_old_count FROM public.dbk51_stock_balances;
  IF v_old_count IS DISTINCT FROM p_expected_old_count THEN
    RAISE EXCEPTION 'Original Neon row count changed; no rebaseline';
  END IF;
  IF jsonb_typeof(p_expected_old_rows) IS DISTINCT FROM 'array' OR
     (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'product_id', t.product_id,'variant_id',t.variant_id,
        'location_id',t.location_id,'on_hand',t.on_hand,'incoming',t.incoming)
        ORDER BY t.product_id,t.variant_id,t.location_id),'[]'::jsonb)
      FROM public.dbk51_stock_balances t) <> p_expected_old_rows THEN
    RAISE EXCEPTION 'Original Neon stock values changed during reconciliation; no rebaseline';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.product_id,t.variant_id,t.location_id),'[]'::jsonb)
  INTO v_old_rows FROM public.dbk51_stock_balances t;

  -- Ensure every replacement row is valid before overwriting existing balances.
  SELECT count(*) INTO v_rows FROM jsonb_to_recordset(p_rows) AS r(
    product_id text,variant_id text,location_id text,on_hand bigint,incoming bigint,
    product_revision text,inventory_revision text);
  IF v_rows <> jsonb_array_length(p_rows)
    OR EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_rows) AS r(
        product_id text,variant_id text,location_id text,on_hand bigint,incoming bigint,
        product_revision text,inventory_revision text)
      WHERE nullif(r.product_id,'') IS NULL OR r.variant_id IS NULL
        OR nullif(r.location_id,'') IS NULL OR r.on_hand IS NULL OR r.on_hand < 0
        OR r.incoming IS NULL OR r.incoming < 0 OR r.product_revision IS NULL
        OR r.inventory_revision IS NULL)
    OR (SELECT count(DISTINCT (product_id,variant_id,location_id))
        FROM jsonb_to_recordset(p_rows) AS r(
          product_id text,variant_id text,location_id text,
          on_hand bigint,incoming bigint,product_revision text,inventory_revision text)) <> v_rows
  THEN RAISE EXCEPTION 'Replacement rows invalid or duplicate keys'; END IF;

  -- Immutable backup, including non-sellable/unallocated variants, before replacement.
  INSERT INTO public.dbk101_stock_rebaseline_backups(
    rebaseline_id,source_revision_fingerprint,original_seed_fingerprint,
    replacement_seed_fingerprint,original_engine_config,original_cutover_config,
    original_balances,replacement_balances,old_row_count,new_row_count)
  VALUES(p_rebaseline_id,p_source_revision_fingerprint,p_expected_old_fingerprint,
    p_new_fingerprint,to_jsonb(v_engine),to_jsonb(v_cutover),
    v_old_rows,p_rows,v_old_count,v_rows);

  DELETE FROM public.dbk51_stock_balances;
  INSERT INTO public.dbk51_stock_balances(
    product_id,variant_id,location_id,on_hand,incoming,
    product_revision,inventory_revision,seed_fingerprint)
  SELECT r.product_id,r.variant_id,r.location_id,r.on_hand,r.incoming,
    r.product_revision,r.inventory_revision,p_new_fingerprint
  FROM jsonb_to_recordset(p_rows) AS r(
    product_id text,variant_id text,location_id text,on_hand bigint,incoming bigint,
    product_revision text,inventory_revision text);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> v_rows OR (SELECT count(*) FROM public.dbk51_stock_balances) <> v_rows THEN
    RAISE EXCEPTION 'DBK-101 replacement row count mismatch; transaction rolled back';
  END IF;
  UPDATE public.dbk51_stock_engine_config
    SET seed_fingerprint=p_new_fingerprint,seed_created_at=now(),updated_at=now()
    WHERE singleton;
  UPDATE public.dbk62_cutover_config
    SET reconciliation_fingerprint=p_new_fingerprint,updated_at=now()
    WHERE singleton;
  -- DO NOT enable any write, payment, stock-authority or callback gate here.
  RETURN jsonb_build_object('status','REBASELINED_WITH_BACKUP',
     'rebaselineId',p_rebaseline_id,'oldRows',v_old_count,
     'newRows',v_inserted,'fingerprint',p_new_fingerprint,
     'paymentsEnabled',false,'stockWritesEnabled',false);
END;
$$;
-- DBK101_STATEMENT
REVOKE ALL ON FUNCTION public.dbk101_rebaseline_stock(text,text,text,text,integer,jsonb,jsonb) FROM PUBLIC;
