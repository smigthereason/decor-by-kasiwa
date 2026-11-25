-- Run ONLY on a disposable Neon branch with the DBK151 migration installed.
-- Synthetic stock, operations and orders are rolled back, even on success.
BEGIN;
DO $$
DECLARE
  p text := 'dbk151-test-'||md5(random()::text);
  op text := 'dbk151-11111111-1111-4111-8111-111111111111';
  plan jsonb := '[{"locationId":"OTC_TEST","variantId":"black","quantity":100},{"locationId":"OTC_TEST","variantId":"silver","quantity":65},{"locationId":"MAIN_TEST","variantId":"silver","quantity":12}]';
  keys jsonb := '["black","silver"]';
  result jsonb;
BEGIN
  -- Branch-only fixture gate overrides are transaction scoped and rolled back.
  UPDATE public.dbk51_stock_engine_config SET writes_enabled=true,seed_fingerprint=coalesce(seed_fingerprint,'dbk151-test') WHERE singleton;
  UPDATE public.dbk69_inventory_config SET enabled=true WHERE singleton;
  UPDATE public.dbk74_freeze_control SET active=false WHERE singleton;
  INSERT INTO public.dbk51_stock_balances(product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
  VALUES(p,'','OTC_TEST',165,0,'test','test','dbk151-test'),(p,'','MAIN_TEST',12,0,'test','test','dbk151-test');
  INSERT INTO public.dbk51_stock_operations(operation_id,product_id,variant_id,operation_type,request_payload,result_payload)
    VALUES(p||'-historical',p,'','SALE','{}','{}');
  BEGIN
    PERFORM public.dbk151_allocate_variants(op,p,keys,'[{"locationId":"OTC_TEST","variantId":"black","quantity":164}]','test-admin');
    RAISE EXCEPTION 'TEST FAILED: underallocation accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DBK151 stock changed%' THEN RAISE; END IF; END;
  IF (SELECT sum(on_hand) FROM public.dbk51_stock_balances WHERE product_id=p)<>177 THEN RAISE EXCEPTION 'TEST FAILED: rejected plan changed stock'; END IF;
  result:=public.dbk151_allocate_variants(op,p,keys,plan,'test-admin');
  IF result->>'replayed'<>'false' OR (SELECT on_hand FROM public.dbk51_stock_balances WHERE product_id=p AND location_id='OTC_TEST' AND variant_id='black')<>100
    OR (SELECT sum(on_hand) FROM public.dbk51_stock_balances WHERE product_id=p AND location_id='OTC_TEST')<>165
    OR (SELECT sum(on_hand) FROM public.dbk51_stock_balances WHERE product_id=p AND location_id='MAIN_TEST')<>12
    OR (SELECT sum(on_hand) FROM public.dbk51_stock_balances WHERE product_id=p AND variant_id='')<>0 THEN RAISE EXCEPTION 'TEST FAILED: allocation conservation'; END IF;
  result:=public.dbk151_allocate_variants(op,p,keys,plan,'test-admin');
  IF result->>'replayed'<>'true' OR (SELECT sum(on_hand) FROM public.dbk51_stock_balances WHERE product_id=p)<>177 THEN RAISE EXCEPTION 'TEST FAILED: replay duplicated stock'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.dbk51_stock_operations WHERE operation_id=p||'-historical') THEN RAISE EXCEPTION 'TEST FAILED: original history lost'; END IF;
  -- Old return must continue to work; new operations using the blank identity may not.
  PERFORM public.dbk51_apply_stock(p||'-return',jsonb_build_object('type','RETURN','productId',p,'variantId','','quantity',2,'destinationStoreId','OTC_TEST','orderId','test-historic-order'));
  BEGIN
    PERFORM public.dbk51_apply_stock(p||'-stale-sale',jsonb_build_object('type','SALE','productId',p,'variantId','','quantity',1,'sourceStoreId','OTC_TEST','orderId','test-stale-order'));
    RAISE EXCEPTION 'TEST FAILED: stale nonvariant sale accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'DBK151 legacy identity%' THEN RAISE; END IF; END;
  IF (SELECT on_hand FROM public.dbk51_stock_balances WHERE product_id=p AND location_id='OTC_TEST' AND variant_id='')<>2 THEN RAISE EXCEPTION 'TEST FAILED: returned units changed'; END IF;
  PERFORM public.dbk51_apply_stock(p||'-variant-sale',jsonb_build_object('type','SALE','productId',p,'variantId','black','quantity',1,'sourceStoreId','OTC_TEST','orderId','test-variant-order'));
  IF (SELECT sum(on_hand) FROM public.dbk51_stock_balances WHERE product_id=p)<>178 THEN RAISE EXCEPTION 'TEST FAILED: variant sale balance'; END IF;
  RAISE NOTICE 'DBK151 PASS: exact allocation, invalid plan rollback, store conservation, replay, historical identity, return and variant sale';
END $$;
ROLLBACK;
