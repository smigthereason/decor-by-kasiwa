-- DBK-103: atomic, provider-verified WhatsApp stock commit on the existing
-- production Neon stock ledger. Install only against the pinned MAIN neondb.
-- This DDL creates a function; installation does not enable any writes or send STK.
CREATE OR REPLACE FUNCTION public.dbk103_commit_verified_wa_stock(
  p_ref text, p_store text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $dbk103$
DECLARE
  v_paid public.dbk36_wa_paid_intake%ROWTYPE;
  v_claim jsonb;
  v_finish jsonb;
  v_batch jsonb;
  v_payload jsonb;
  v_items jsonb := '[]'::jsonb;
  v_line jsonb;
  v_total bigint := 0;
  v_updated integer;
  v_order text;
  v_batch_id text;
  v_actor text := 'DBK36_DARAJA_AUTOMATION';
BEGIN
  IF p_ref !~ '^DBKWA[A-Z0-9]{7}$' OR
     p_store <> 'storeLocation.4fcbd28b74494e7da7176525e63d73f4' THEN
    RAISE EXCEPTION 'DBK103_INPUT_INVALID';
  END IF;
  -- DBK-51/54/62 and inventory authority must all be on. Do not enable
  -- these gates in this migration; other writers/callbacks must cut over first.
  IF NOT EXISTS (
    SELECT 1 FROM public.dbk51_stock_engine_config s
      JOIN public.dbk62_cutover_config c USING(singleton)
      JOIN public.dbk69_inventory_config i USING(singleton)
    WHERE s.singleton AND s.writes_enabled AND s.seed_fingerprint IS NOT NULL
      AND c.enabled AND c.sanity_stock_frozen AND c.all_stock_writers_switched
      AND c.provider_callbacks_ready AND i.enabled
      AND c.reconciliation_fingerprint=s.seed_fingerprint
  ) THEN RAISE EXCEPTION 'DBK103_STOCK_AUTHORITY_GATE_OFF'; END IF;

  -- The claim routine takes the same per-reference advisory lock and locks
  -- the provider-confirmed paid record. A duplicate callback is idempotent.
  SELECT * INTO v_paid FROM public.dbk36_wa_paid_intake
    WHERE reference=p_ref FOR UPDATE;
  IF NOT FOUND OR v_paid.verification_mode<>'daraja_api_verified'
    OR v_paid.attested_by<>'DBK36_DARAJA_QUERY'
    OR v_paid.provider_receipt IS NULL
    OR v_paid.amount_minor < 100
    OR jsonb_typeof(v_paid.cart_snapshot) <> 'array' THEN
    RAISE EXCEPTION 'DBK103_VERIFIED_PAYMENT_REQUIRED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.dbk36_wa_prod_payment_orders o
    JOIN public.dbk36_wa_prod_callback_inbox cb
      ON cb.checkout_id=o.checkout_id AND cb.query_confirmed_at IS NOT NULL
    WHERE o.reference=p_ref AND o.status='paid'
      AND o.wa_id=v_paid.wa_id AND o.checkout_id=v_paid.checkout_id
      AND o.receipt=v_paid.provider_receipt
      AND o.amount_kes*100=v_paid.amount_minor
  ) THEN RAISE EXCEPTION 'DBK103_PROVIDER_QUERY_PROOF_REQUIRED'; END IF;
  IF jsonb_array_length(v_paid.cart_snapshot) < 1
    OR jsonb_array_length(v_paid.cart_snapshot) > 12 THEN
    RAISE EXCEPTION 'DBK103_CART_INVALID';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_paid.cart_snapshot) LOOP
    IF jsonb_typeof(v_line)<>'object'
      OR length(coalesce(v_line->>'productId','')) NOT BETWEEN 1 AND 180
      OR length(coalesce(v_line->>'variantId',''))>180
      OR coalesce(v_line->>'quantity','') !~ '^[1-9][0-9]*$'
      OR coalesce(v_line->>'subtotalMinor','') !~ '^[1-9][0-9]*$'
      OR (v_line->>'quantity')::bigint > 20 THEN
      RAISE EXCEPTION 'DBK103_CART_LINE_INVALID';
    END IF;
    v_total := v_total + (v_line->>'subtotalMinor')::bigint;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'productId',v_line->>'productId',
      'variantId',coalesce(v_line->>'variantId',''),
      'quantity',(v_line->>'quantity')::bigint,
      'sourceStoreId',p_store));
  END LOOP;
  IF v_total <> v_paid.amount_minor THEN
    RAISE EXCEPTION 'DBK103_CART_PAYMENT_AMOUNT_MISMATCH';
  END IF;
  v_order := 'DBK36-WA-' || p_ref;
  v_batch_id := 'dbk103-' || p_ref;
  v_payload := jsonb_build_object(
    'type','SALE','orderId',v_order,'items',v_items);

  SELECT public.dbk36_wa_stock_claim(p_ref,v_actor,p_store) INTO v_claim;
  IF v_claim IS NULL THEN RAISE EXCEPTION 'DBK103_STOCK_CLAIM_MISSING'; END IF;
  IF coalesce((v_claim->>'replayed')::boolean,false) THEN
    -- Historical Sanity stock commitments must NOT be deducted again on Neon.
    IF v_claim->>'status'='COMMITTED' AND EXISTS(
      SELECT 1 FROM public.dbk54_stock_batches
      WHERE batch_id=v_batch_id AND order_id=v_order AND batch_type='SALE'
    ) THEN
      RETURN jsonb_build_object('stockState','COMMITTED','orderId',v_order,'replayed',true);
    END IF;
    RAISE EXCEPTION 'DBK103_EXISTING_STOCK_CLAIM_REQUIRES_REVIEW';
  END IF;
  IF v_claim->>'status'<>'CLAIMED' OR
     coalesce(v_claim->>'orderId','')<>v_order OR
     coalesce(v_claim->>'claimToken','') !~ '^[0-9a-f-]{36}$' THEN
    RAISE EXCEPTION 'DBK103_STOCK_CLAIM_INVALID';
  END IF;
  SELECT public.dbk54_apply_stock_batch(v_batch_id,v_payload) INTO v_batch;
  IF v_batch IS NULL OR v_batch->>'orderId'<>v_order THEN
    RAISE EXCEPTION 'DBK103_STOCK_BATCH_UNCONFIRMED';
  END IF;
  SELECT public.dbk36_wa_stock_finish(
    p_ref,(v_claim->>'claimToken')::uuid,v_actor,'COMMITTED','') INTO v_finish;
  IF v_finish->>'status'<>'COMMITTED' THEN
    RAISE EXCEPTION 'DBK103_FULFILLMENT_UNCONFIRMED';
  END IF;
  UPDATE public.dbk36_wa_prod_payment_orders
    SET stock_state='COMMITTED',last_error_code=NULL,updated_at=now()
    WHERE reference=p_ref AND status='paid'
      AND stock_state IN ('PENDING','REVIEW_REQUIRED','COMMITTED');
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  IF v_updated<>1 THEN RAISE EXCEPTION 'DBK103_STOCK_STATUS_UNCONFIRMED'; END IF;
  RETURN jsonb_build_object('stockState','COMMITTED','orderId',v_order,
    'batchId',v_batch_id,'replayed',false);
END;
$dbk103$;
REVOKE ALL ON FUNCTION public.dbk103_commit_verified_wa_stock(text,text) FROM PUBLIC;
