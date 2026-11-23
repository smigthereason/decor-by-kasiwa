-- DBK: on-hand-only negative Receive Stock adjustments.
-- Apply ONCE to a verified/staged Neon database before deploying the matching API.
-- This does not reseed balances or change existing stock values.
-- It does not alter the existing dbk51_apply_stock or dbk69_apply_inventory functions.
BEGIN;

-- Refuse to overwrite an unfamiliar production schema. The source snapshot
-- contains the original positive-only check with this exact constraint name.
DO $preflight$
DECLARE
  v_constraint text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_constraint
  FROM pg_constraint c
  WHERE c.conrelid = 'public.dbk69_inventory_movements'::regclass
    AND c.conname = 'dbk69_inventory_movements_quantity_check'
    AND c.contype = 'c';
  IF v_constraint IS NULL OR v_constraint NOT LIKE '%quantity > 0%' THEN
    RAISE EXCEPTION 'DBK_SIGNED_RECEIVE_SCHEMA_MISMATCH: inspect current constraints before migration';
  END IF;
END
$preflight$;

-- Preserve positive-only PURCHASE and TRANSFER records while allowing negative
-- RECEIVE quantities. A receipt reduction never represents a supplier return.
ALTER TABLE public.dbk69_inventory_movements
  DROP CONSTRAINT dbk69_inventory_movements_quantity_check;
ALTER TABLE public.dbk69_inventory_movements
  ADD CONSTRAINT dbk69_inventory_movements_quantity_check
  CHECK (quantity > 0 OR (movement_type = 'RECEIVE' AND quantity < 0));

CREATE OR REPLACE FUNCTION public.dbk69_apply_stock_reduction(
  p_id text, p_payload jsonb, p_meta jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_product text := p_payload->>'productId';
  v_variant text := coalesce(p_payload->>'variantId','');
  v_destination text := p_payload->>'destinationStoreId';
  v_quantity bigint;
  v_before bigint;
  v_after bigint;
  v_incoming bigint;
  v_existing public.dbk69_inventory_movements%ROWTYPE;
  v_stock_result jsonb;
  v_result jsonb;
BEGIN
  IF p_id !~ '^dbk69-[0-9a-fA-F-]{36}$'
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_meta) IS DISTINCT FROM 'object'
     OR p_payload->>'type' IS DISTINCT FROM 'RECEIVE'
     OR p_payload->>'adjustmentKind' IS DISTINCT FROM 'ON_HAND_REDUCTION'
     OR jsonb_typeof(p_payload->'quantity') IS DISTINCT FROM 'number'
     OR p_payload->>'quantity' !~ '^-[1-9][0-9]{0,9}$'
     OR nullif(v_product,'') IS NULL OR nullif(v_destination,'') IS NULL
     OR v_variant = '__UNALLOCATED_VARIANT__'
     OR nullif(p_meta->>'actorId','') IS NULL
     OR nullif(p_meta->>'actorName','') IS NULL
     OR nullif(p_meta->>'productName','') IS NULL
     OR length(coalesce(p_meta->>'actorId','')) > 200
     OR length(coalesce(p_meta->>'actorName','')) > 200
     OR length(coalesce(p_meta->>'productName','')) > 250
     OR length(coalesce(p_meta->>'note','')) NOT BETWEEN 5 AND 500
     OR p_meta->>'unitCost' !~ '^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$'
  THEN
    RAISE EXCEPTION 'DBK_SIGNED_RECEIVE_INVALID';
  END IF;

  v_quantity := (p_payload->>'quantity')::bigint;
  IF v_quantity < -1000000000 THEN RAISE EXCEPTION 'DBK_SIGNED_RECEIVE_LIMIT'; END IF;

  -- Same lock ordering as dbk69_apply_inventory -> dbk51_apply_stock.
  -- Serialize same operation ID then the product across sales, receipts and transfers.
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk69:'||p_id,69));
  IF NOT EXISTS (SELECT 1 FROM public.dbk69_inventory_config WHERE singleton AND enabled)
     OR NOT EXISTS (SELECT 1 FROM public.dbk51_stock_engine_config
                    WHERE singleton AND writes_enabled AND seed_fingerprint IS NOT NULL)
  THEN RAISE EXCEPTION 'DBK_SIGNED_RECEIVE_GATE_OFF'; END IF;

  SELECT * INTO v_existing
    FROM public.dbk69_inventory_movements WHERE operation_id=p_id;
  IF FOUND THEN
    IF v_existing.movement_type <> 'RECEIVE' OR v_existing.quantity >= 0
       OR v_existing.request_payload <> p_payload OR v_existing.metadata <> p_meta
    THEN RAISE EXCEPTION 'DBK_SIGNED_RECEIVE_ID_REUSED'; END IF;
    RETURN v_existing.result_payload || jsonb_build_object('replayed',true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dbk51:'||v_product,51));
  IF EXISTS (SELECT 1 FROM public.dbk51_stock_operations WHERE operation_id=p_id)
  THEN RAISE EXCEPTION 'DBK_SIGNED_RECEIVE_LEDGER_ID_CONFLICT'; END IF;

  SELECT on_hand,incoming INTO v_before,v_incoming
    FROM public.dbk51_stock_balances
    WHERE product_id=v_product AND variant_id=v_variant AND location_id=v_destination
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DBK_SIGNED_RECEIVE_BALANCE_MISSING'; END IF;

  -- Atomic conditional debit; cannot take the physical balance below zero.
  -- Unlike positive RECEIVE, do NOT change incoming or create a purchase/return.
  UPDATE public.dbk51_stock_balances
     SET on_hand=on_hand+v_quantity,updated_at=now()
   WHERE product_id=v_product AND variant_id=v_variant AND location_id=v_destination
     AND on_hand >= -v_quantity
  RETURNING on_hand INTO v_after;
  IF NOT FOUND THEN RAISE EXCEPTION 'DBK_SIGNED_RECEIVE_INSUFFICIENT'; END IF;

  v_stock_result := jsonb_build_object(
    'operationId',p_id,'type','RECEIVE','adjustmentKind','ON_HAND_REDUCTION',
    'productId',v_product,'variantId',v_variant,'quantity',v_quantity,
    'destinationStoreId',v_destination,'replayed',false
  );
  -- Existing DBK-51 operation ledger remains the idempotent canonical history.
  INSERT INTO public.dbk51_stock_operations
    (operation_id,product_id,variant_id,operation_type,request_payload,result_payload)
  VALUES(p_id,v_product,v_variant,'RECEIVE',p_payload,v_stock_result);

  v_result := v_stock_result || jsonb_build_object(
    'movementId','dbk69.'||p_id,'stockBefore',v_before,'stockAfter',v_after,
    'incomingBefore',v_incoming,'incomingAfter',v_incoming,
    'locationOnHand',v_after,'locationIncoming',v_incoming
  );
  -- Same transaction as stock change + DBK-51 entry. Failed inserts roll back all.
  INSERT INTO public.dbk69_inventory_movements
    (operation_id,request_payload,metadata,result_payload,product_id,variant_id,
     movement_type,quantity,actor_id,actor_name)
  VALUES(p_id,p_payload,p_meta,v_result,v_product,v_variant,'RECEIVE',v_quantity,
         p_meta->>'actorId',p_meta->>'actorName');
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.dbk69_apply_stock_reduction(text,jsonb,jsonb) FROM PUBLIC;
COMMIT;
