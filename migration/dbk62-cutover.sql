-- DBK-62: REAL manual POS contract. NOT a cutover instruction.
-- Requires DBK-51, DBK-54, DBK-56, DBK-57 schema on the *target* Neon database.
-- Default FALSE; never turn on until all POS/checkout/refunds/reports/receivables
-- and stock writers have switched and a fresh inventory reconciliation is signed off.
CREATE TABLE IF NOT EXISTS public.dbk62_cutover_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  reconciliation_fingerprint text,
  sanity_stock_frozen boolean NOT NULL DEFAULT false,
  all_stock_writers_switched boolean NOT NULL DEFAULT false,
  provider_callbacks_ready boolean NOT NULL DEFAULT false,
  receivables_ready boolean NOT NULL DEFAULT false,
  refunds_ready boolean NOT NULL DEFAULT false,
  reports_ready boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk62_cutover_config(singleton, enabled) VALUES(true,false)
ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dbk62_manual_sales (
  order_id text PRIMARY KEY REFERENCES public.dbk56_pos_orders(order_id) ON DELETE RESTRICT,
  request_key text NOT NULL UNIQUE REFERENCES public.dbk57_manual_sales(request_key) ON DELETE RESTRICT,
  display_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(display_snapshot) = 'object')
);
CREATE INDEX IF NOT EXISTS dbk62_manual_sales_created_at_idx ON public.dbk62_manual_sales(created_at DESC);

CREATE OR REPLACE FUNCTION public.dbk62_record_real_manual_sale(
  p_request_key text, p_payload jsonb, p_display jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_order_id text := p_payload->'order'->>'orderId';
  v_existing public.dbk62_manual_sales%ROWTYPE;
  v_original jsonb;
  v_result jsonb;
BEGIN
  -- Independent database gate, never opened by this function.
  IF NOT EXISTS (
    SELECT 1 FROM public.dbk62_cutover_config c
    JOIN public.dbk51_stock_engine_config s ON s.singleton = c.singleton
    WHERE c.singleton AND c.enabled AND c.sanity_stock_frozen
      AND c.all_stock_writers_switched AND c.provider_callbacks_ready
      AND c.receivables_ready AND c.refunds_ready AND c.reports_ready
      AND c.reconciliation_fingerprint IS NOT NULL AND length(c.reconciliation_fingerprint) >= 32
      AND s.seed_fingerprint = c.reconciliation_fingerprint
      AND s.writes_enabled
  ) OR NOT EXISTS(SELECT 1 FROM public.dbk56_ledger_config WHERE singleton AND enabled)
     OR NOT EXISTS(SELECT 1 FROM public.dbk57_manual_sale_config WHERE singleton AND enabled)
  THEN RAISE EXCEPTION 'DBK-62 production cutover not approved in database'; END IF;

  IF p_request_key !~ '^dbk62-manual-[0-9a-f]{24}$'
     OR coalesce(v_order_id,'') !~ '^dbk62[.]order[.][0-9a-f]{24}$'
     OR coalesce(p_payload->'order'->>'orderNumber','') !~ '^DBK62-POS-[0-9a-f]{24}$'
     OR p_payload->'cashierConfirmed' IS DISTINCT FROM 'true'::jsonb
     OR coalesce(p_payload->'payment'->>'provider','') <> 'manual'
     OR coalesce(p_payload->'payment'->>'purpose','') <> 'INITIAL'
     OR coalesce(p_payload->'payment'->>'providerReference','') !~ '^[A-Z0-9-]{5,100}$'
     OR coalesce(p_payload->'payment'->>'providerReference','') LIKE 'DBK58-TEST-%'
     OR coalesce(p_payload->'payment'->>'evidenceReference','') !~ '^cashier-confirmed-[a-f0-9]{24}$'
     OR p_payload->'order'->>'deliveryMinor' <> '0'
     OR p_payload->'overpaymentApproved' IS NOT NULL AND p_payload->'overpaymentApproved' <> 'false'::jsonb
     OR jsonb_typeof(p_display) IS DISTINCT FROM 'object'
     OR p_display - 'customerName' - 'customerPhone' - 'customerEmail' - 'sellerName' - 'sellerRole'
                  - 'storeName' - 'paymentName' - 'paymentReference' - 'internalReference' - 'receiptNumber'
                  - 'productNames' - 'lineDetails' - 'deliveryLocation'
                  - 'discountType' - 'discountValue' - 'discountReason' - 'discountAuthorizedByName' <> '{}'::jsonb
     OR coalesce(p_display->>'paymentReference','') <> p_payload->'payment'->>'providerReference'
     OR coalesce(p_display->>'internalReference','') !~ '^DBK-POS-[A-Za-z0-9-]{8,80}$'
     OR p_display->>'receiptNumber' <> 'RCT-' || p_payload->'order'->>'orderNumber'
     OR length(coalesce(p_display->>'customerName','')) NOT BETWEEN 1 AND 150
     OR length(coalesce(p_display->>'sellerName','')) NOT BETWEEN 1 AND 150
     OR length(coalesce(p_display->>'storeName','')) NOT BETWEEN 1 AND 150
     OR jsonb_typeof(p_display->'productNames') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_display->'lineDetails') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_display->'productNames') <> jsonb_array_length(p_payload->'order'->'items')
     OR jsonb_array_length(p_display->'lineDetails') <> jsonb_array_length(p_payload->'order'->'items')
  THEN RAISE EXCEPTION 'DBK-62 refuses invalid real-sale contract'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('dbk62:' || p_request_key,62));
  SELECT * INTO v_existing FROM public.dbk62_manual_sales WHERE request_key=p_request_key FOR UPDATE;
  IF FOUND THEN
    SELECT original_payload INTO v_original FROM public.dbk57_manual_sales WHERE request_key=p_request_key;
    IF v_existing.order_id<>v_order_id OR v_original IS DISTINCT FROM p_payload
       OR v_existing.display_snapshot<>p_display
    THEN RAISE EXCEPTION 'Conflicting DBK-62 idempotency replay'; END IF;
    SELECT result_payload INTO v_result FROM public.dbk57_manual_sales WHERE request_key=p_request_key;
    RETURN v_result || jsonb_build_object('replayed',true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.dbk57_manual_sales WHERE request_key=p_request_key)
  THEN RAISE EXCEPTION 'Existing DBK-57 order cannot be adopted by DBK-62'; END IF;

  -- This call, including metadata persistence, is ONE PostgreSQL statement/transaction.
  -- Any stock/payment/metadata failure rolls the entire sale back.
  v_result := public.dbk57_record_manual_sale(p_request_key, p_payload);
  IF v_result->>'stockCommitted' IS DISTINCT FROM 'true'
     OR v_result->>'replayed' IS DISTINCT FROM 'false'
  THEN RAISE EXCEPTION 'DBK-62 failed to commit order, stock and initial payment'; END IF;
  INSERT INTO public.dbk62_manual_sales(order_id,request_key,display_snapshot)
    VALUES(v_order_id,p_request_key,p_display);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.dbk62_record_real_manual_sale(text,jsonb,jsonb) FROM PUBLIC;
