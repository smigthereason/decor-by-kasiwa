-- DBK-90 controlled RECONCILIATION of a previously seeded but disabled Neon inventory ledger.
-- INSTALL only after operator approval. Installing this function does not change balances/gates.
-- Invoke only through reviewed dbk90_stock_reconcile.mjs and while all Sanity stock writers are frozen.
CREATE TABLE IF NOT EXISTS public.dbk90_stock_reconciliation_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operator_label text NOT NULL,
  previous_fingerprint text NOT NULL,
  next_fingerprint text NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  reconciled_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.dbk90_reconcile_stock(
  p_before jsonb, p_after jsonb, p_previous_seed text, p_next_seed text, p_operator text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  previous_state jsonb;
  next_state jsonb;
  expected_next_state jsonb;
  n integer;
  current_seed text;
  enabled_count integer;
  gate_count integer;
  writes boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk51-seed',51));
  LOCK TABLE public.dbk51_stock_balances IN ACCESS EXCLUSIVE MODE;
  IF p_before IS NULL OR jsonb_typeof(p_before) <> 'object' OR p_after IS NULL OR jsonb_typeof(p_after) <> 'array' OR
    jsonb_array_length(p_after) NOT BETWEEN 1 AND 200000 OR
    p_previous_seed !~ '^[0-9a-f]{64}$' OR p_next_seed !~ '^[0-9a-f]{64}$' OR
    p_previous_seed = p_next_seed OR length(trim(coalesce(p_operator,''))) < 3 THEN
    RAISE EXCEPTION 'DBK90 invalid parameters';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dbk74_freeze_control WHERE singleton AND active) THEN
    RAISE EXCEPTION 'DBK90 maintenance freeze not active';
  END IF;
  SELECT seed_fingerprint,writes_enabled INTO current_seed,writes
  FROM public.dbk51_stock_engine_config WHERE singleton FOR UPDATE;
  IF current_seed IS DISTINCT FROM p_previous_seed OR writes IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'DBK90 unexpected current stock fingerprint or writes enabled';
  END IF;
  IF EXISTS(SELECT 1 FROM public.dbk51_stock_operations)
    OR EXISTS(SELECT 1 FROM public.dbk54_stock_batches)
    OR EXISTS(SELECT 1 FROM public.dbk55_paid_pos_settlements)
    OR EXISTS(SELECT 1 FROM public.dbk56_pos_orders)
    OR EXISTS(SELECT 1 FROM public.dbk56_pos_payments)
    OR EXISTS(SELECT 1 FROM public.dbk57_manual_sales)
    OR EXISTS(SELECT 1 FROM public.dbk62_manual_sales)
    OR EXISTS(SELECT 1 FROM public.dbk63_pos_refunds)
    OR EXISTS(SELECT 1 FROM public.dbk64_online_orders)
    OR EXISTS(SELECT 1 FROM public.dbk65_online_fulfilment)
    OR EXISTS(SELECT 1 FROM public.dbk68_daraja_orders)
    OR EXISTS(SELECT 1 FROM public.dbk69_inventory_movements)
  THEN
    RAISE EXCEPTION 'DBK90 operational Neon history exists; cannot replace seeded stock snapshot';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE enabled)
  INTO gate_count, enabled_count
  FROM (
    SELECT writes_enabled AS enabled FROM public.dbk51_stock_engine_config WHERE singleton
    UNION ALL SELECT enabled FROM public.dbk55_settlement_config WHERE singleton
    UNION ALL SELECT enabled FROM public.dbk56_ledger_config WHERE singleton
    UNION ALL SELECT enabled FROM public.dbk57_manual_sale_config WHERE singleton
    UNION ALL SELECT enabled FROM public.dbk62_cutover_config WHERE singleton
    UNION ALL SELECT enabled FROM public.dbk63_financial_config WHERE singleton
    UNION ALL SELECT enabled FROM public.dbk64_online_config WHERE singleton
    UNION ALL SELECT enabled FROM public.dbk65_online_fulfilment_config WHERE singleton
    UNION ALL SELECT enabled FROM public.dbk68_daraja_config WHERE singleton
    UNION ALL SELECT enabled FROM public.dbk69_inventory_config WHERE singleton
  ) g;
  IF gate_count<>10 OR enabled_count<>0 THEN
    RAISE EXCEPTION 'DBK90 Neon write gates incomplete or enabled';
  END IF;
  SELECT coalesce(jsonb_object_agg(product_id || chr(31) || variant_id || chr(31) || location_id,
    jsonb_build_object('on_hand',on_hand,'incoming',incoming,'product_revision',product_revision,
      'inventory_revision',inventory_revision,'seed_fingerprint',seed_fingerprint)), '{}'::jsonb)
    INTO previous_state FROM public.dbk51_stock_balances;
  IF previous_state IS DISTINCT FROM p_before THEN
    RAISE EXCEPTION 'DBK90 existing Neon stock diverged from reviewed baseline';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_after)
      AS r(product_id text, variant_id text, location_id text, on_hand bigint, incoming bigint,
           product_revision text, inventory_revision text, seed_fingerprint text)
    WHERE nullif(r.product_id,'') IS NULL OR r.variant_id IS NULL OR nullif(r.location_id,'') IS NULL
      OR r.on_hand IS NULL OR r.on_hand<0 OR r.incoming IS NULL OR r.incoming<0
      OR nullif(r.product_revision,'') IS NULL OR nullif(r.inventory_revision,'') IS NULL
      OR r.seed_fingerprint IS DISTINCT FROM p_next_seed
  ) THEN RAISE EXCEPTION 'DBK90 invalid replacement row'; END IF;
  SELECT count(*),count(DISTINCT (product_id,variant_id,location_id))
    INTO n, gate_count
    FROM jsonb_to_recordset(p_after)
    AS r(product_id text, variant_id text, location_id text);
  IF n<>gate_count OR n<>jsonb_array_length(p_after) THEN
    RAISE EXCEPTION 'DBK90 duplicate replacement keys';
  END IF;
  DELETE FROM public.dbk51_stock_balances;
  INSERT INTO public.dbk51_stock_balances
    (product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
  SELECT product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint
  FROM jsonb_to_recordset(p_after) AS r(product_id text,variant_id text,location_id text,
    on_hand bigint,incoming bigint,product_revision text,inventory_revision text,seed_fingerprint text);
  UPDATE public.dbk51_stock_engine_config SET seed_fingerprint=p_next_seed, updated_at=now() WHERE singleton;
  SELECT coalesce(jsonb_object_agg(product_id || chr(31) || variant_id || chr(31) || location_id,
    jsonb_build_object('on_hand',on_hand,'incoming',incoming,'product_revision',product_revision,
      'inventory_revision',inventory_revision,'seed_fingerprint',seed_fingerprint)), '{}'::jsonb)
    INTO next_state FROM public.dbk51_stock_balances;
  SELECT coalesce(jsonb_object_agg(product_id || chr(31) || variant_id || chr(31) || location_id,
    jsonb_build_object('on_hand',on_hand,'incoming',incoming,'product_revision',product_revision,
      'inventory_revision',inventory_revision,'seed_fingerprint',seed_fingerprint)), '{}'::jsonb)
    INTO expected_next_state FROM jsonb_to_recordset(p_after) AS r(product_id text,variant_id text,location_id text,
      on_hand bigint,incoming bigint,product_revision text,inventory_revision text,seed_fingerprint text);
  IF next_state IS DISTINCT FROM expected_next_state THEN
    RAISE EXCEPTION 'DBK90 post-update stock mismatch';
  END IF;
  INSERT INTO public.dbk90_stock_reconciliation_log
    (operator_label,previous_fingerprint,next_fingerprint,before_state,after_state)
  VALUES(p_operator,p_previous_seed,p_next_seed,previous_state,next_state);
  RETURN jsonb_build_object('updatedRows',n,'previousFingerprint',p_previous_seed,
    'newFingerprint',p_next_seed,'writeGatesEnabled',false,'neonStockReconciled',true);
END;$$;
REVOKE ALL ON FUNCTION public.dbk90_reconcile_stock(jsonb,jsonb,text,text,text) FROM PUBLIC;
-- IMPORTANT: grant EXECUTE only to the verified dedicated migration/admin role used by DATABASE_URL.
