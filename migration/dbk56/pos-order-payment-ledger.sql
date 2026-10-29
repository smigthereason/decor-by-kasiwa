-- DBK-56 — isolated test branch only. Canonical *candidate* order/financial ledger.
-- Do not run on production; no live route calls these functions.
-- DBK-51/54/55 remain independent, with their write gates OFF.
CREATE TABLE IF NOT EXISTS public.dbk56_ledger_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk56_ledger_config(singleton,enabled) VALUES(true,false)
ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dbk56_pos_orders (
  order_id text PRIMARY KEY,
  request_key text NOT NULL UNIQUE,
  order_number text NOT NULL UNIQUE,
  channel text NOT NULL CHECK (channel IN ('POS','ONLINE')),
  store_id text NOT NULL,
  seller_id text NOT NULL,
  currency text NOT NULL DEFAULT 'KES' CHECK (currency='KES'),
  subtotal_minor bigint NOT NULL CHECK(subtotal_minor >= 0),
  discount_minor bigint NOT NULL CHECK(discount_minor >= 0),
  delivery_minor bigint NOT NULL CHECK(delivery_minor >= 0),
  total_minor bigint NOT NULL CHECK(total_minor > 0 AND total_minor <= 1000000000000),
  collected_minor bigint NOT NULL DEFAULT 0 CHECK(collected_minor >= 0 AND collected_minor <= 1000000000000),
  balance_due_minor bigint GENERATED ALWAYS AS (greatest(0::bigint,total_minor-collected_minor)) STORED,
  overpaid_minor bigint GENERATED ALWAYS AS (greatest(0::bigint,collected_minor-total_minor)) STORED,
  financial_status text GENERATED ALWAYS AS (
    CASE WHEN collected_minor=0 THEN 'UNPAID'
         WHEN collected_minor < total_minor THEN 'PARTIALLY_PAID'
         ELSE 'PAID' END
  ) STORED,
  original_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dbk56_orders_store_created_idx ON public.dbk56_pos_orders(store_id,created_at DESC);
CREATE INDEX IF NOT EXISTS dbk56_orders_balance_idx ON public.dbk56_pos_orders(store_id,balance_due_minor)
  WHERE collected_minor < total_minor;

CREATE TABLE IF NOT EXISTS public.dbk56_pos_order_lines (
  order_id text NOT NULL REFERENCES public.dbk56_pos_orders(order_id) ON DELETE RESTRICT,
  line_number integer NOT NULL CHECK(line_number BETWEEN 1 AND 100),
  product_id text NOT NULL,
  variant_id text NOT NULL DEFAULT '',
  store_id text NOT NULL,
  quantity integer NOT NULL CHECK(quantity > 0 AND quantity <= 1000000),
  unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0 AND unit_price_minor<=1000000000000),
  line_total_minor bigint NOT NULL CHECK(line_total_minor>=0 AND line_total_minor<=1000000000000),
  PRIMARY KEY(order_id,line_number),
  CHECK (line_total_minor=quantity::bigint*unit_price_minor),
  CHECK (variant_id <> '__UNALLOCATED_VARIANT__'),
  CHECK (store_id <> '__UNALLOCATED__')
);
CREATE INDEX IF NOT EXISTS dbk56_lines_product_idx ON public.dbk56_pos_order_lines(product_id,variant_id);

CREATE TABLE IF NOT EXISTS public.dbk56_pos_payments (
  event_key text PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.dbk56_pos_orders(order_id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK(provider IN ('cash','manual','daraja','paystack')),
  provider_reference text NOT NULL,
  payment_purpose text NOT NULL CHECK(payment_purpose IN ('INITIAL','RECEIVABLE')),
  amount_minor bigint NOT NULL CHECK(amount_minor > 0 AND amount_minor<=1000000000000),
  -- Evidence is a reference, NOT cryptographic proof. Provider verification is a future integration requirement.
  evidence_reference text NOT NULL,
  original_payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider,provider_reference)
);
CREATE INDEX IF NOT EXISTS dbk56_payments_order_idx ON public.dbk56_pos_payments(order_id,recorded_at);
-- At most one initial payment for each order; later receipts are explicitly receivables.
CREATE UNIQUE INDEX IF NOT EXISTS dbk56_one_initial_payment_idx
  ON public.dbk56_pos_payments(order_id) WHERE payment_purpose='INITIAL';

-- No mutation of DBK-51 stock or DBK-55 settlement here.
-- Public access is revoked below. DB role owner must be explicitly trusted.
CREATE OR REPLACE FUNCTION public.dbk56_create_pos_order(p_request_key text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 v_order text:=p_payload->>'orderId';
 v_order_number text:=p_payload->>'orderNumber';
 v_channel text:=p_payload->>'channel';
 v_store text:=p_payload->>'storeId';
 v_seller text:=p_payload->>'sellerId';
 v_currency text:=p_payload->>'currency';
 v_delivery text:=p_payload->>'deliveryMinor';
 v_discount text:=p_payload->>'discountMinor';
 v_items jsonb:=p_payload->'items';
 v_item jsonb;
 v_qty text;
 v_price text;
 v_subtotal numeric:=0;
 v_total numeric;
 v_line integer:=0;
 v_existing public.dbk56_pos_orders%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.dbk56_ledger_config WHERE singleton AND enabled)
 THEN RAISE EXCEPTION 'DBK-56 write gate is disabled'; END IF;
 IF p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 12 AND 180
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR (p_payload - 'orderId' - 'orderNumber' - 'channel' - 'storeId' - 'sellerId'
       - 'currency' - 'deliveryMinor' - 'discountMinor' - 'items') <> '{}'::jsonb
    OR v_order IS NULL OR length(v_order) NOT BETWEEN 1 AND 180
    OR v_order_number IS NULL OR length(v_order_number) NOT BETWEEN 1 AND 180
    OR v_channel NOT IN ('POS','ONLINE') OR v_channel IS NULL
    OR v_store IS NULL OR length(v_store) NOT BETWEEN 1 AND 180 OR v_store='__UNALLOCATED__'
    OR v_seller IS NULL OR length(v_seller) NOT BETWEEN 1 AND 180
    OR v_currency IS DISTINCT FROM 'KES'
    OR jsonb_typeof(p_payload->'deliveryMinor') IS DISTINCT FROM 'number'
    OR coalesce(v_delivery,'') !~ '^[0-9]+$' OR length(v_delivery)>13
    OR jsonb_typeof(p_payload->'discountMinor') IS DISTINCT FROM 'number'
    OR coalesce(v_discount,'') !~ '^[0-9]+$' OR length(v_discount)>13
    OR jsonb_typeof(v_items) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Invalid DBK-56 order payload'; END IF;
 IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 100
 THEN RAISE EXCEPTION 'Invalid DBK-56 item count'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dbk56:order:'||v_order,56));
 SELECT * INTO v_existing FROM public.dbk56_pos_orders WHERE order_id=v_order FOR UPDATE;
 IF FOUND THEN
   IF v_existing.request_key <> p_request_key OR v_existing.original_payload<>p_payload
   THEN RAISE EXCEPTION 'Conflicting DBK-56 order replay'; END IF;
   RETURN jsonb_build_object('orderId',v_order,'replayed',true,
       'totalMinor',v_existing.total_minor,'financialStatus',v_existing.financial_status,
       'balanceDueMinor',v_existing.balance_due_minor);
 END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
   v_line:=v_line+1;
   v_qty:=v_item->>'quantity'; v_price:=v_item->>'unitPriceMinor';
   IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR (v_item - 'productId' - 'variantId' - 'storeId' - 'quantity' - 'unitPriceMinor') <> '{}'::jsonb
      OR nullif(v_item->>'productId','') IS NULL OR length(v_item->>'productId')>180
      OR (v_item ? 'variantId' AND (jsonb_typeof(v_item->'variantId') IS DISTINCT FROM 'string'
          OR length(v_item->>'variantId')>180 OR v_item->>'variantId'='__UNALLOCATED_VARIANT__'))
      OR v_item->>'storeId' IS DISTINCT FROM v_store
      OR jsonb_typeof(v_item->'quantity') IS DISTINCT FROM 'number'
      OR coalesce(v_qty,'') !~ '^[1-9][0-9]*$' OR length(v_qty)>7
      OR jsonb_typeof(v_item->'unitPriceMinor') IS DISTINCT FROM 'number'
      OR coalesce(v_price,'') !~ '^[0-9]+$' OR length(v_price)>13
   THEN RAISE EXCEPTION 'Invalid DBK-56 order line'; END IF;
   IF v_qty::numeric >1000000 OR v_price::numeric>1000000000000
   THEN RAISE EXCEPTION 'DBK-56 order line exceeds limits'; END IF;
   v_subtotal:=v_subtotal+v_qty::numeric*v_price::numeric;
   IF v_subtotal>1000000000000 THEN RAISE EXCEPTION 'DBK-56 subtotal exceeds limit'; END IF;
 END LOOP;
 v_total:=v_subtotal+v_delivery::numeric-v_discount::numeric;
 IF v_total<=0 OR v_total>1000000000000
 THEN RAISE EXCEPTION 'Invalid DBK-56 order total'; END IF;
 INSERT INTO public.dbk56_pos_orders(order_id,request_key,order_number,channel,store_id,seller_id,
   currency,subtotal_minor,discount_minor,delivery_minor,total_minor,original_payload)
 VALUES(v_order,p_request_key,v_order_number,v_channel,v_store,v_seller,
   'KES',v_subtotal::bigint,v_discount::bigint,v_delivery::bigint,v_total::bigint,p_payload);
 v_line:=0;
 FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
   v_line:=v_line+1;
   INSERT INTO public.dbk56_pos_order_lines(order_id,line_number,product_id,variant_id,store_id,quantity,
      unit_price_minor,line_total_minor)
   VALUES(v_order,v_line,
     v_item->>'productId',coalesce(v_item->>'variantId',''),v_store,(v_item->>'quantity')::integer,
     (v_item->>'unitPriceMinor')::bigint,((v_item->>'quantity')::bigint*(v_item->>'unitPriceMinor')::bigint));
 END LOOP;
 RETURN jsonb_build_object('orderId',v_order,'replayed',false,'totalMinor',v_total::bigint,
   'financialStatus','UNPAID','balanceDueMinor',v_total::bigint);
END;
$$;

-- Separate idempotent receipt, one DB transaction updates payment + order balance.
-- For RECEIVABLE, never accept more than remaining balance. INITIAL may be overpaid
-- because the existing POS has an explicit overpayment-reconciliation workflow.
CREATE OR REPLACE FUNCTION public.dbk56_record_pos_payment(p_event_key text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
 v_order_id text:=p_payload->>'orderId';
 v_provider text:=p_payload->>'provider';
 v_reference text:=p_payload->>'providerReference';
 v_purpose text:=p_payload->>'purpose';
 v_amount text:=p_payload->>'amountMinor';
 v_evidence text:=p_payload->>'evidenceReference';
 v_order public.dbk56_pos_orders%ROWTYPE;
 v_previous public.dbk56_pos_payments%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.dbk56_ledger_config WHERE singleton AND enabled)
 THEN RAISE EXCEPTION 'DBK-56 write gate is disabled'; END IF;
 IF p_event_key IS NULL OR length(p_event_key) NOT BETWEEN 12 AND 180
   OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
   OR (p_payload - 'orderId' - 'provider' - 'providerReference' - 'purpose'
      - 'amountMinor' - 'evidenceReference') <> '{}'::jsonb
   OR v_order_id IS NULL OR length(v_order_id) NOT BETWEEN 1 AND 180
   OR v_provider NOT IN ('cash','manual','daraja','paystack') OR v_provider IS NULL
   OR v_reference IS NULL OR length(v_reference) NOT BETWEEN 5 AND 180
   OR v_purpose NOT IN ('INITIAL','RECEIVABLE') OR v_purpose IS NULL
   OR jsonb_typeof(p_payload->'amountMinor') IS DISTINCT FROM 'number'
   OR coalesce(v_amount,'') !~ '^[1-9][0-9]*$' OR length(v_amount)>13
   OR v_evidence IS NULL OR length(v_evidence) NOT BETWEEN 5 AND 180
 THEN RAISE EXCEPTION 'Invalid DBK-56 payment payload'; END IF;
 IF v_amount::numeric>1000000000000 THEN RAISE EXCEPTION 'DBK-56 payment exceeds limit'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dbk56:order:'||v_order_id,56));
 SELECT * INTO v_order FROM public.dbk56_pos_orders WHERE order_id=v_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cannot pay unknown DBK-56 order'; END IF;
 SELECT * INTO v_previous FROM public.dbk56_pos_payments WHERE event_key=p_event_key;
 IF FOUND THEN
   IF v_previous.original_payload<>p_payload
   THEN RAISE EXCEPTION 'Conflicting DBK-56 payment replay'; END IF;
   RETURN jsonb_build_object('orderId',v_order_id,'replayed',true,'financialStatus',v_order.financial_status,
       'collectedMinor',v_order.collected_minor,'balanceDueMinor',v_order.balance_due_minor,
       'overpaidMinor',v_order.overpaid_minor);
 END IF;
 IF v_purpose='INITIAL' AND EXISTS(SELECT 1 FROM public.dbk56_pos_payments
      WHERE order_id=v_order_id AND payment_purpose='INITIAL')
 THEN RAISE EXCEPTION 'Initial payment already recorded'; END IF;
 IF v_purpose='RECEIVABLE' AND (v_order.collected_minor<=0 OR v_order.balance_due_minor<=0
      OR v_amount::bigint>v_order.balance_due_minor)
 THEN RAISE EXCEPTION 'Receivable payment exceeds outstanding balance or is not applicable'; END IF;
 IF (v_order.collected_minor::numeric+v_amount::numeric)>1000000000000
 THEN RAISE EXCEPTION 'Payment total exceeds DBK-56 limit'; END IF;
 INSERT INTO public.dbk56_pos_payments(event_key,order_id,provider,provider_reference,
    payment_purpose,amount_minor,evidence_reference,original_payload)
 VALUES(p_event_key,v_order_id,v_provider,v_reference,v_purpose,v_amount::bigint,v_evidence,p_payload);
 UPDATE public.dbk56_pos_orders SET collected_minor=collected_minor+v_amount::bigint,
    updated_at=now() WHERE order_id=v_order_id;
 SELECT * INTO v_order FROM public.dbk56_pos_orders WHERE order_id=v_order_id;
 RETURN jsonb_build_object('orderId',v_order_id,'replayed',false,'financialStatus',v_order.financial_status,
    'collectedMinor',v_order.collected_minor,'balanceDueMinor',v_order.balance_due_minor,
    'overpaidMinor',v_order.overpaid_minor);
END;
$$;
REVOKE ALL ON FUNCTION public.dbk56_create_pos_order(text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dbk56_record_pos_payment(text,jsonb) FROM PUBLIC;
