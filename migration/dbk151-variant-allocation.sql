-- DBK151: explicit, audited, per-location reclassification; no stock changes on install.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk151_variant_allocations (
  operation_id text PRIMARY KEY,
  product_id text NOT NULL,
  actor_id text NOT NULL,
  variant_ids jsonb NOT NULL,
  allocation jsonb NOT NULL,
  before_balances jsonb NOT NULL,
  after_balances jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dbk151_allocation_product_idx ON public.dbk151_variant_allocations(product_id);
REVOKE ALL ON public.dbk151_variant_allocations FROM PUBLIC;

-- Once converted, original blank identity is reserved for historically keyed returns.
-- Trigger runs inside the original stock transaction; rejection rolls back its balance update.
CREATE OR REPLACE FUNCTION public.dbk151_protect_legacy_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.variant_id='' AND NEW.operation_type<>'RETURN' AND EXISTS (
    SELECT 1 FROM public.dbk151_variant_allocations WHERE product_id=NEW.product_id
  ) THEN RAISE EXCEPTION 'DBK151 legacy identity is reserved for historical returns'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS dbk151_legacy_identity_guard ON public.dbk51_stock_operations;
CREATE TRIGGER dbk151_legacy_identity_guard BEFORE INSERT ON public.dbk51_stock_operations
FOR EACH ROW EXECUTE FUNCTION public.dbk151_protect_legacy_identity();

-- Serialize new legacy checkout creation with allocation, before the payment is initiated.
CREATE OR REPLACE FUNCTION public.dbk151_guard_pending_checkout() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_product text;
BEGIN
  FOR v_product IN SELECT DISTINCT x->>'productId' FROM jsonb_array_elements(NEW.snapshot->'lines') x
    WHERE coalesce(x->>'variantId','')='' AND nullif(x->>'productId','') IS NOT NULL ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('dbk51:'||v_product,51));
    IF EXISTS (SELECT 1 FROM public.dbk151_variant_allocations WHERE product_id=v_product) THEN
      RAISE EXCEPTION 'DBK151 product now requires a variant; refresh the checkout';
    END IF;
  END LOOP;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS dbk151_checkout_guard ON public.dbk64_online_orders;
CREATE TRIGGER dbk151_checkout_guard BEFORE INSERT ON public.dbk64_online_orders
FOR EACH ROW EXECUTE FUNCTION public.dbk151_guard_pending_checkout();
DROP TRIGGER IF EXISTS dbk151_checkout_guard ON public.dbk68_daraja_orders;
CREATE TRIGGER dbk151_checkout_guard BEFORE INSERT ON public.dbk68_daraja_orders
FOR EACH ROW EXECUTE FUNCTION public.dbk151_guard_pending_checkout();

CREATE OR REPLACE FUNCTION public.dbk151_allocate_variants(p_id text,p_product text,p_keys jsonb,p_plan jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_before jsonb; v_after jsonb; v_prior public.dbk151_variant_allocations%ROWTYPE;
  v_seed public.dbk51_stock_balances%ROWTYPE; v_row record;
BEGIN
  IF coalesce(p_id,'') !~ '^dbk151-[0-9a-f-]{36}$' OR nullif(p_product,'') IS NULL OR nullif(p_actor,'') IS NULL
    OR jsonb_typeof(p_keys) IS DISTINCT FROM 'array' OR jsonb_array_length(p_keys) NOT BETWEEN 1 AND 100
    OR jsonb_typeof(p_plan) IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan)>10000 THEN
    RAISE EXCEPTION 'DBK151 invalid allocation contract'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_keys) k(id) WHERE id !~ '^[A-Za-z0-9._-]{1,100}$' OR left(id,13)='__UNALLOCATED')
    OR (SELECT count(DISTINCT id) FROM jsonb_array_elements_text(p_keys) k(id))<>jsonb_array_length(p_keys) THEN
    RAISE EXCEPTION 'DBK151 invalid variant keys'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_plan) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
    OR x-'locationId'-'variantId'-'quantity'<>'{}'::jsonb OR nullif(x->>'locationId','') IS NULL
    OR NOT (p_keys ? coalesce(x->>'variantId','')) OR jsonb_typeof(x->'quantity') IS DISTINCT FROM 'number'
    OR coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,9}$') THEN RAISE EXCEPTION 'DBK151 invalid allocation rows'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_plan) x GROUP BY x->>'locationId',x->>'variantId' HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_plan) x WHERE (x->>'quantity')::numeric>1000000000) THEN
    RAISE EXCEPTION 'DBK151 duplicate or excessive allocation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk51:'||p_product,51));
  SELECT * INTO v_prior FROM public.dbk151_variant_allocations WHERE operation_id=p_id;
  IF FOUND THEN
    IF v_prior.product_id<>p_product OR v_prior.variant_ids<>p_keys OR v_prior.allocation<>p_plan THEN RAISE EXCEPTION 'DBK151 conflicting replay'; END IF;
    RETURN jsonb_build_object('operationId',p_id,'replayed',true);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dbk51_stock_engine_config WHERE singleton AND writes_enabled AND seed_fingerprint IS NOT NULL)
    OR NOT EXISTS(SELECT 1 FROM public.dbk69_inventory_config WHERE singleton AND enabled)
    OR EXISTS(SELECT 1 FROM public.dbk74_freeze_control WHERE singleton AND active) THEN RAISE EXCEPTION 'DBK151 stock authority unavailable'; END IF;
  SELECT * INTO v_seed FROM public.dbk51_stock_balances WHERE product_id=p_product ORDER BY variant_id,location_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'DBK151 missing seeded product'; END IF;
  IF EXISTS(SELECT 1 FROM public.dbk51_stock_balances WHERE product_id=p_product AND variant_id='' AND incoming<>0) THEN RAISE EXCEPTION 'DBK151 outstanding incoming stock'; END IF;
  IF EXISTS(SELECT 1 FROM public.dbk51_stock_balances WHERE product_id=p_product AND variant_id='__UNALLOCATED_VARIANT__' AND (on_hand<>0 OR incoming<>0)) THEN RAISE EXCEPTION 'DBK151 quarantined variant stock'; END IF;
  IF EXISTS(SELECT 1 FROM public.dbk51_stock_balances WHERE product_id=p_product AND variant_id NOT IN ('','__UNALLOCATED_VARIANT__') AND NOT (p_keys ? variant_id)) THEN RAISE EXCEPTION 'DBK151 cannot remove registered variant'; END IF;
  -- Old unpaid/paid-but-uncommitted orders must be resolved before retiring their stock identity.
  IF EXISTS(SELECT 1 FROM public.dbk64_online_orders o CROSS JOIN LATERAL jsonb_array_elements(o.snapshot->'lines') x
    WHERE (o.payment_status='PENDING' OR (o.payment_status='PAID' AND o.stock_status<>'COMMITTED')) AND x->>'productId'=p_product AND coalesce(x->>'variantId','')='')
    OR EXISTS(SELECT 1 FROM public.dbk68_daraja_orders o CROSS JOIN LATERAL jsonb_array_elements(o.snapshot->'lines') x
    WHERE (o.payment_status IN ('CREATED','STARTING','PENDING') OR (o.payment_status='PAID' AND o.stock_status<>'COMMITTED')) AND x->>'productId'=p_product AND coalesce(x->>'variantId','')='')
    OR EXISTS(SELECT 1 FROM public.dbk55_paid_pos_settlements o CROSS JOIN LATERAL jsonb_array_elements(o.source_payload->'items') x
    WHERE o.stock_status<>'COMMITTED' AND x->>'productId'=p_product AND coalesce(x->>'variantId','')='') THEN
    RAISE EXCEPTION 'DBK151 unresolved legacy checkout or paid stock settlement'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_plan) x WHERE NOT EXISTS(SELECT 1 FROM public.dbk51_stock_balances b WHERE b.product_id=p_product AND b.variant_id='' AND b.location_id=x->>'locationId')) THEN RAISE EXCEPTION 'DBK151 unknown legacy location'; END IF;
  IF EXISTS(SELECT 1 FROM public.dbk51_stock_balances b WHERE b.product_id=p_product AND b.variant_id='' AND b.on_hand<>coalesce((SELECT sum((x->>'quantity')::bigint) FROM jsonb_array_elements(p_plan) x WHERE x->>'locationId'=b.location_id),0)) THEN
    RAISE EXCEPTION 'DBK151 stock changed or allocation does not match location total'; END IF;
  SELECT jsonb_agg(to_jsonb(b) ORDER BY variant_id,location_id) INTO v_before FROM public.dbk51_stock_balances b WHERE product_id=p_product;
  -- Register every catalogue identity, including zero-stock variants.
  INSERT INTO public.dbk51_stock_balances(product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
  SELECT p_product,k.id,'__UNALLOCATED__',0,0,v_seed.product_revision,v_seed.inventory_revision,v_seed.seed_fingerprint FROM jsonb_array_elements_text(p_keys) k(id)
  WHERE NOT EXISTS(SELECT 1 FROM public.dbk51_stock_balances b WHERE b.product_id=p_product AND b.variant_id=k.id)
  ON CONFLICT(product_id,variant_id,location_id) DO NOTHING;
  FOR v_row IN SELECT x->>'locationId' AS loc,x->>'variantId' AS vid,(x->>'quantity')::bigint AS qty FROM jsonb_array_elements(p_plan) x LOOP
    INSERT INTO public.dbk51_stock_balances AS b(product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
    VALUES(p_product,v_row.vid,v_row.loc,v_row.qty,0,v_seed.product_revision,v_seed.inventory_revision,v_seed.seed_fingerprint)
    ON CONFLICT(product_id,variant_id,location_id) DO UPDATE SET on_hand=b.on_hand+EXCLUDED.on_hand,updated_at=now();
  END LOOP;
  -- Preserve original keys for historical refunds; only the reviewed on-hand quantity moves.
  UPDATE public.dbk51_stock_balances SET on_hand=0,updated_at=now() WHERE product_id=p_product AND variant_id='' AND on_hand<>0;
  SELECT jsonb_agg(to_jsonb(b) ORDER BY variant_id,location_id) INTO v_after FROM public.dbk51_stock_balances b WHERE product_id=p_product;
  IF EXISTS(WITH old_totals AS (SELECT x->>'location_id' loc,sum((x->>'on_hand')::numeric) hand,sum((x->>'incoming')::numeric) inc FROM jsonb_array_elements(v_before) x GROUP BY 1),
    new_totals AS (SELECT x->>'location_id' loc,sum((x->>'on_hand')::numeric) hand,sum((x->>'incoming')::numeric) inc FROM jsonb_array_elements(v_after) x GROUP BY 1)
    SELECT 1 FROM old_totals o FULL JOIN new_totals n USING(loc) WHERE coalesce(o.hand,0)<>coalesce(n.hand,0) OR coalesce(o.inc,0)<>coalesce(n.inc,0)) THEN RAISE EXCEPTION 'DBK151 location conservation failed'; END IF;
  INSERT INTO public.dbk151_variant_allocations(operation_id,product_id,actor_id,variant_ids,allocation,before_balances,after_balances) VALUES(p_id,p_product,p_actor,p_keys,p_plan,v_before,v_after);
  RETURN jsonb_build_object('operationId',p_id,'replayed',false);
END; $$;
REVOKE ALL ON FUNCTION public.dbk151_allocate_variants(text,text,jsonb,jsonb,text) FROM PUBLIC;
COMMIT;
