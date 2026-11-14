-- DBK-120. Zero-stock variant registration only. Does not change existing balances,
-- financial rows, payment gates, stock operations or other DBK-51 functions.
CREATE OR REPLACE FUNCTION public.dbk120_register_catalogue_variants(
  p_product_id text, p_variant_ids jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_requested_count integer;
  v_existing_rows integer;
  v_added integer := 0;
  v_revision text;
  v_inventory_revision text;
  v_fingerprint text;
  v_existing_nonvariant integer;
BEGIN
  IF nullif(p_product_id,'') IS NULL OR length(p_product_id) > 250
    OR jsonb_typeof(p_variant_ids) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_variant_ids) < 1 OR jsonb_array_length(p_variant_ids) > 100 THEN
    RAISE EXCEPTION 'Invalid DBK-120 variant registration';
  END IF;
  SELECT count(*) INTO v_requested_count FROM jsonb_array_elements_text(p_variant_ids) AS k(id);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_variant_ids) AS k(id)
    WHERE k.id !~ '^[A-Za-z0-9._-]{1,100}$'
       OR k.id IN ('__UNALLOCATED_VARIANT__','__UNALLOCATED__'))
    OR (SELECT count(DISTINCT id) FROM jsonb_array_elements_text(p_variant_ids) AS k(id)) <> v_requested_count THEN
    RAISE EXCEPTION 'Invalid or duplicate variant identifier';
  END IF;

  -- Serialize with every DBK-51 purchase, sale, receipt, transfer and refund for this product.
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk51:'||p_product_id,51));
  IF NOT EXISTS (SELECT 1 FROM public.dbk51_stock_engine_config
                  WHERE singleton AND writes_enabled AND seed_fingerprint IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM public.dbk69_inventory_config WHERE singleton AND enabled)
    OR EXISTS (SELECT 1 FROM public.dbk74_freeze_control WHERE singleton AND active) THEN
    RAISE EXCEPTION 'DBK-120 requires active, unfrozen Neon stock authority';
  END IF;

  SELECT product_revision, inventory_revision, seed_fingerprint
    INTO v_revision, v_inventory_revision, v_fingerprint
    FROM public.dbk51_stock_balances WHERE product_id=p_product_id
    ORDER BY variant_id,location_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'DBK-120 missing seeded product; refusing new stock'; END IF;
  -- Never discard a known old variant, even if its current stock is zero.
  IF EXISTS (SELECT 1 FROM public.dbk51_stock_balances b WHERE b.product_id=p_product_id
     AND b.variant_id NOT IN ('','__UNALLOCATED_VARIANT__')
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_variant_ids) AS k(id) WHERE k.id=b.variant_id)) THEN
    RAISE EXCEPTION 'DBK-120 cannot remove or rename a historical variant identifier';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dbk51_stock_balances b WHERE b.product_id=p_product_id
     AND b.variant_id='__UNALLOCATED_VARIANT__' AND (b.on_hand<>0 OR b.incoming<>0)) THEN
    RAISE EXCEPTION 'DBK-120 quarantined stock requires reviewed reconciliation';
  END IF;

  SELECT count(*) INTO v_existing_nonvariant FROM public.dbk51_stock_balances
    WHERE product_id=p_product_id AND variant_id='';
  IF v_existing_nonvariant>0 THEN
    IF EXISTS(SELECT 1 FROM public.dbk51_stock_balances
        WHERE product_id=p_product_id AND variant_id='' AND (on_hand<>0 OR incoming<>0))
      OR EXISTS(SELECT 1 FROM public.dbk51_stock_operations
        WHERE product_id=p_product_id AND variant_id='') THEN
      RAISE EXCEPTION 'DBK-120 cannot convert a stocked or historically transacted non-variant product';
    END IF;
    -- Only remove empty, never-transacted legacy non-variant balances. No units lost.
    DELETE FROM public.dbk51_stock_balances WHERE product_id=p_product_id AND variant_id=''
      AND on_hand=0 AND incoming=0;
  END IF;

  INSERT INTO public.dbk51_stock_balances
    (product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
  SELECT p_product_id,k.id,'__UNALLOCATED__',0,0,v_revision,v_inventory_revision,v_fingerprint
  FROM jsonb_array_elements_text(p_variant_ids) AS k(id)
  WHERE NOT EXISTS (SELECT 1 FROM public.dbk51_stock_balances b
     WHERE b.product_id=p_product_id AND b.variant_id=k.id)
  ON CONFLICT(product_id,variant_id,location_id) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_variant_ids) AS k(id)
     WHERE NOT EXISTS (SELECT 1 FROM public.dbk51_stock_balances b
       WHERE b.product_id=p_product_id AND b.variant_id=k.id)) THEN
    RAISE EXCEPTION 'DBK-120 registration did not cover all requested variants';
  END IF;
  RETURN jsonb_build_object('registered',v_requested_count,'newZeroStockRows',v_added,
    'existingNonvariantRowsRemoved',v_existing_nonvariant,'stocksPreserved',true);
END;
$$;
REVOKE ALL ON FUNCTION public.dbk120_register_catalogue_variants(text,jsonb) FROM PUBLIC;
