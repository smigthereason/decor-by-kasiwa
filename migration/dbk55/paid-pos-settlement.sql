-- DBK-55: TEST-BRANCH-ONLY Neon paid POS settlement with stock reconciliation.
-- Prerequisites: DBK-51 schema/seed, DBK-54 atomic basket schema.
-- NEVER run this on production until all POS and online settlement flows are migrated.
-- The application does not call this function. The independent gate defaults OFF.
CREATE TABLE IF NOT EXISTS public.dbk55_settlement_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk55_settlement_config(singleton,enabled)
VALUES(true,false) ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dbk55_paid_pos_settlements (
  order_id text PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  payment_provider text NOT NULL CHECK (payment_provider IN ('daraja','paystack','manual')),
  provider_payment_id text NOT NULL,
  provider_receipt text,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 1000000000000),
  currency text NOT NULL DEFAULT 'KES' CHECK (currency='KES'),
  source_payload jsonb NOT NULL,
  stock_batch_id text NOT NULL UNIQUE,
  financial_status text NOT NULL DEFAULT 'PAID' CHECK (financial_status='PAID'),
  stock_status text NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (stock_status IN ('COMMITTED','REVIEW_REQUIRED')),
  stock_attempts integer NOT NULL DEFAULT 0 CHECK (stock_attempts >= 0),
  stock_error_code text,
  stock_error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_provider,provider_payment_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS dbk55_unique_receipt_idx
  ON public.dbk55_paid_pos_settlements(payment_provider,provider_receipt)
  WHERE provider_receipt IS NOT NULL;
CREATE INDEX IF NOT EXISTS dbk55_stock_review_idx
  ON public.dbk55_paid_pos_settlements(stock_status,created_at);

-- Persist CONFIRMED financial truth; stock errors are captured without erasing PAID.
-- Payment authenticity MUST have been verified by the application before calling.
-- The SQL itself cannot verify Safaricom/Paystack signatures, references or amounts.
CREATE OR REPLACE FUNCTION public.dbk55_record_paid_pos(p_event_key text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_order text := p_payload->>'orderId';
  v_provider text := p_payload->>'provider';
  v_payment text := p_payload->>'providerPaymentId';
  v_receipt text := nullif(p_payload->>'providerReceipt','');
  v_amount text := p_payload->>'amountMinor';
  v_currency text := p_payload->>'currency';
  v_items jsonb := p_payload->'items';
  v_line jsonb;
  v_existing public.dbk55_paid_pos_settlements%ROWTYPE;
  v_stock_payload jsonb;
  v_stock_result jsonb;
  v_batch text;
  v_failed_code text;
  v_failed_detail text;
BEGIN
  IF nullif(p_event_key,'') IS NULL OR length(p_event_key) < 12 OR length(p_event_key) > 180
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_payload - 'orderId' - 'provider' - 'providerPaymentId' - 'providerReceipt'
       - 'amountMinor' - 'currency' - 'items' <> '{}'::jsonb
     OR nullif(v_order,'') IS NULL OR length(v_order) > 180
     OR v_provider NOT IN ('daraja','paystack','manual') OR v_provider IS NULL
     OR nullif(v_payment,'') IS NULL OR length(v_payment) < 6 OR length(v_payment) > 180
     OR (v_receipt IS NOT NULL AND length(v_receipt)>180)
     OR (v_provider='manual' AND v_receipt IS NULL)
     OR v_currency IS DISTINCT FROM 'KES'
     OR coalesce(v_amount,'') !~ '^[1-9][0-9]*$' OR length(v_amount)>13
     OR jsonb_typeof(v_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid DBK-55 confirmed payment payload';
  END IF;
  IF v_amount::numeric>1000000000000 THEN
    RAISE EXCEPTION 'Invalid DBK-55 amount';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
       OR v_line - 'productId' - 'variantId' - 'quantity' - 'sourceStoreId' <> '{}'::jsonb
       OR nullif(v_line->>'productId','') IS NULL OR length(v_line->>'productId')>180
       OR v_line->>'variantId'='__UNALLOCATED_VARIANT__'
       OR coalesce(v_line->>'quantity','') !~ '^[1-9][0-9]*$'
       OR length(v_line->>'quantity')>10
       OR nullif(v_line->>'sourceStoreId','') IS NULL
       OR v_line->>'sourceStoreId'='__UNALLOCATED__'
       OR length(v_line->>'sourceStoreId')>180 THEN
      RAISE EXCEPTION 'Invalid DBK-55 stock line';
    END IF;
    IF (v_line->>'quantity')::numeric > 1000000000 THEN
      RAISE EXCEPTION 'Invalid DBK-55 stock quantity';
    END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk55:order:'||v_order,55));
  IF NOT EXISTS(SELECT 1 FROM public.dbk55_settlement_config WHERE singleton AND enabled) THEN
    RAISE EXCEPTION 'DBK-55 paid settlement gate is disabled';
  END IF;
  SELECT * INTO v_existing FROM public.dbk55_paid_pos_settlements
    WHERE order_id=v_order FOR UPDATE;
  IF FOUND THEN
    IF v_existing.event_key<>p_event_key OR v_existing.source_payload<>p_payload THEN
      RAISE EXCEPTION 'Conflicting paid settlement replay for order';
    END IF;
    RETURN jsonb_build_object('orderId',v_order,'financialStatus','PAID',
      'stockStatus',v_existing.stock_status,'replayed',true,
      'inventoryReviewRequired',(v_existing.stock_status<>'COMMITTED'));
  END IF;
  v_batch:='dbk55-sale-'||md5(v_order);
  v_stock_payload:=jsonb_build_object('type','SALE','orderId',v_order,'items',v_items);
  INSERT INTO public.dbk55_paid_pos_settlements
    (order_id,event_key,payment_provider,provider_payment_id,provider_receipt,
     amount_minor,currency,source_payload,stock_batch_id)
  VALUES(v_order,p_event_key,v_provider,v_payment,v_receipt,
     v_amount::bigint,'KES',p_payload,v_batch);
  -- Savepoint-like exception block: a failed stock batch rolls back its own
  -- writes, not the already-recorded confirmed payment above.
  BEGIN
    SELECT public.dbk54_apply_stock_batch(v_batch,v_stock_payload) INTO v_stock_result;
    UPDATE public.dbk55_paid_pos_settlements SET stock_status='COMMITTED',
      stock_attempts=stock_attempts+1,stock_error_code=NULL,stock_error_detail=NULL,
      updated_at=now() WHERE order_id=v_order;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_failed_code = RETURNED_SQLSTATE, v_failed_detail = MESSAGE_TEXT;
    UPDATE public.dbk55_paid_pos_settlements SET stock_status='REVIEW_REQUIRED',
      stock_attempts=stock_attempts+1,stock_error_code=v_failed_code,
      stock_error_detail=left(v_failed_detail,300),updated_at=now() WHERE order_id=v_order;
  END;
  SELECT * INTO v_existing FROM public.dbk55_paid_pos_settlements WHERE order_id=v_order;
  RETURN jsonb_build_object('orderId',v_order,'financialStatus','PAID',
    'stockStatus',v_existing.stock_status,'replayed',false,
    'inventoryReviewRequired',(v_existing.stock_status<>'COMMITTED'));
END;
$$;

-- Explicit manager-reviewed retry path to be authorized by a future server route.
-- A duplicate webhook/event must NEVER automatically retry a failed stock deduction.
CREATE OR REPLACE FUNCTION public.dbk55_retry_paid_pos_stock(p_order_id text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_existing public.dbk55_paid_pos_settlements%ROWTYPE;
  v_result jsonb;
  v_failed_code text;
  v_failed_detail text;
BEGIN
  IF nullif(p_order_id,'') IS NULL OR length(p_order_id)>180 THEN
    RAISE EXCEPTION 'Invalid DBK-55 order id';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk55:order:'||p_order_id,55));
  IF NOT EXISTS(SELECT 1 FROM public.dbk55_settlement_config WHERE singleton AND enabled) THEN
    RAISE EXCEPTION 'DBK-55 paid settlement gate is disabled';
  END IF;
  SELECT * INTO v_existing FROM public.dbk55_paid_pos_settlements
    WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown paid order cannot change inventory'; END IF;
  IF v_existing.stock_status='COMMITTED' THEN
    RETURN jsonb_build_object('orderId',p_order_id,'stockStatus','COMMITTED','replayed',true);
  END IF;
  BEGIN
    SELECT public.dbk54_apply_stock_batch(v_existing.stock_batch_id,
      jsonb_build_object('type','SALE','orderId',p_order_id,'items',v_existing.source_payload->'items'))
    INTO v_result;
    UPDATE public.dbk55_paid_pos_settlements SET stock_status='COMMITTED',
      stock_attempts=stock_attempts+1,stock_error_code=NULL,stock_error_detail=NULL,
      updated_at=now() WHERE order_id=p_order_id;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_failed_code = RETURNED_SQLSTATE, v_failed_detail = MESSAGE_TEXT;
    UPDATE public.dbk55_paid_pos_settlements SET stock_status='REVIEW_REQUIRED',
      stock_attempts=stock_attempts+1,stock_error_code=v_failed_code,
      stock_error_detail=left(v_failed_detail,300),updated_at=now() WHERE order_id=p_order_id;
  END;
  SELECT * INTO v_existing FROM public.dbk55_paid_pos_settlements WHERE order_id=p_order_id;
  RETURN jsonb_build_object('orderId',p_order_id,'financialStatus','PAID',
    'stockStatus',v_existing.stock_status,
    'inventoryReviewRequired',(v_existing.stock_status<>'COMMITTED'));
END;
$$;
REVOKE ALL ON FUNCTION public.dbk55_record_paid_pos(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk55_retry_paid_pos_stock(text) FROM PUBLIC;
