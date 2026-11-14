-- DBK107: append-only historical receivables ledger. Does not alter Sanity or stock.
-- Must be installed before enabling DBK107_LEGACY_FINANCE_NEON=YES.
CREATE TABLE IF NOT EXISTS public.dbk107_legacy_receivable_accounts (
  order_id text PRIMARY KEY,
  source_rev text NOT NULL,
  original_balance_minor bigint NOT NULL CHECK (original_balance_minor > 0),
  original_paid_minor bigint NOT NULL CHECK (original_paid_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  payment_status text NOT NULL,
  store_id text NOT NULL DEFAULT '',
  customer_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dbk107_original_balance_bounds CHECK (original_balance_minor <= 1000000000000)
);
CREATE TABLE IF NOT EXISTS public.dbk107_legacy_receivable_collections (
  request_key text PRIMARY KEY,
  order_id text NOT NULL REFERENCES public.dbk107_legacy_receivable_accounts(order_id),
  provider_reference text NOT NULL UNIQUE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  actor_id text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dbk107_collections_order_idx ON public.dbk107_legacy_receivable_collections(order_id);
CREATE INDEX IF NOT EXISTS dbk107_collections_created_idx ON public.dbk107_legacy_receivable_collections(created_at);

CREATE OR REPLACE FUNCTION public.dbk107_record_legacy_collection(p jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_order text := p->>'orderId';
  v_rev text := p->>'sourceRev';
  v_request text := p->>'requestKey';
  v_ref text := p->>'providerReference';
  v_actor text := p->>'actorId';
  v_hash text := p->>'payloadHash';
  v_balance bigint;
  v_paid bigint;
  v_total bigint;
  v_amount bigint;
  v_current public.dbk107_legacy_receivable_accounts%ROWTYPE;
  v_prior public.dbk107_legacy_receivable_collections%ROWTYPE;
  v_collected bigint;
  v_replayed boolean := false;
BEGIN
  IF jsonb_typeof(p) <> 'object' OR
     coalesce(length(v_order),0) NOT BETWEEN 2 AND 200 OR
     coalesce(length(v_rev),0) NOT BETWEEN 2 AND 150 OR
     coalesce(length(v_request),0) NOT BETWEEN 8 AND 100 OR
     coalesce(length(v_ref),0) NOT BETWEEN 8 AND 100 OR
     coalesce(length(v_actor),0) NOT BETWEEN 1 AND 200 OR
     coalesce(v_hash,'') !~ '^[a-f0-9]{64}$' OR
     coalesce(p->>'paymentStatus','') NOT IN ('pending','partially_paid') OR
     coalesce(p->>'storeId','') !~ '^.{0,200}$' THEN
    RAISE EXCEPTION 'Invalid DBK107 collection identity, state or reference';
  END IF;
  BEGIN
    v_balance := (p->>'sourceBalanceMinor')::bigint;
    v_paid := (p->>'sourcePaidMinor')::bigint;
    v_total := (p->>'sourceTotalMinor')::bigint;
    v_amount := (p->>'amountMinor')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Invalid DBK107 amount';
  END;
  IF v_balance IS NULL OR v_paid IS NULL OR v_total IS NULL OR v_amount IS NULL OR
     v_balance < 1 OR v_balance > 1000000000000 OR v_paid < 0 OR
     v_total < 0 OR v_paid + v_balance > v_total OR
     v_amount < 1 OR v_amount > v_balance THEN
    RAISE EXCEPTION 'DBK107 amount exceeds source balance';
  END IF;

  -- Database approval is independent of Vercel flags. A mistaken runtime flag
  -- cannot enable legacy financial writes during an unfinished stock handover.
  IF NOT EXISTS (
    SELECT 1 FROM public.dbk62_cutover_config c
      JOIN public.dbk63_financial_config f USING(singleton)
      JOIN public.dbk74_freeze_control z USING(singleton)
    WHERE c.singleton AND c.enabled AND c.receivables_ready AND
      c.refunds_ready AND c.reports_ready AND c.sanity_stock_frozen AND
      c.all_stock_writers_switched AND c.provider_callbacks_ready AND
      f.enabled AND z.active = false
  ) THEN
    RAISE EXCEPTION 'DBK107 financial cutover gate is not approved';
  END IF;

  -- Repeated requests serialize through the same account row.
  INSERT INTO public.dbk107_legacy_receivable_accounts
    (order_id,source_rev,original_balance_minor,original_paid_minor,total_minor,payment_status,store_id,customer_id)
  VALUES (v_order,v_rev,v_balance,v_paid,v_total,p->>'paymentStatus',coalesce(p->>'storeId',''),coalesce(p->>'customerId',''))
  ON CONFLICT (order_id) DO NOTHING;
  SELECT * INTO STRICT v_current FROM public.dbk107_legacy_receivable_accounts
    WHERE order_id=v_order FOR UPDATE;
  IF v_current.source_rev IS DISTINCT FROM v_rev OR
     v_current.original_balance_minor <> v_balance OR
     v_current.original_paid_minor <> v_paid OR
     v_current.total_minor <> v_total OR
     v_current.payment_status IS DISTINCT FROM p->>'paymentStatus' OR
     v_current.store_id IS DISTINCT FROM coalesce(p->>'storeId','') THEN
    RAISE EXCEPTION 'Legacy source changed after Neon collections began. Reconcile before further receipts.';
  END IF;

  SELECT * INTO v_prior FROM public.dbk107_legacy_receivable_collections WHERE request_key=v_request;
  IF FOUND THEN
    IF v_prior.order_id<>v_order OR v_prior.amount_minor<>v_amount OR
       v_prior.provider_reference<>v_ref OR v_prior.payload_hash<>v_hash THEN
      RAISE EXCEPTION 'Replayed request differs from original legacy payment';
    END IF;
    v_replayed := true;
  ELSE
    IF EXISTS (SELECT 1 FROM public.dbk107_legacy_receivable_collections WHERE provider_reference=v_ref) THEN
      RAISE EXCEPTION 'Legacy payment reference already used';
    END IF;
    SELECT coalesce(sum(amount_minor),0)::bigint INTO v_collected
      FROM public.dbk107_legacy_receivable_collections WHERE order_id=v_order;
    IF v_collected + v_amount > v_balance THEN
      RAISE EXCEPTION 'Legacy balance exceeded; payment not recorded';
    END IF;
    INSERT INTO public.dbk107_legacy_receivable_collections
      (request_key,order_id,provider_reference,amount_minor,actor_id,payload_hash)
    VALUES (v_request,v_order,v_ref,v_amount,v_actor,v_hash);
  END IF;
  SELECT coalesce(sum(amount_minor),0)::bigint INTO v_collected
    FROM public.dbk107_legacy_receivable_collections WHERE order_id=v_order;
  RETURN jsonb_build_object('orderId',v_order,'collectedMinor',v_collected,
    'amountPaidMinor',v_paid + v_collected,'balanceDueMinor',v_balance-v_collected,
    'paymentStatus',CASE WHEN v_balance=v_collected THEN 'paid' ELSE 'partially_paid' END,
    'replayed',v_replayed);
END $$;
REVOKE ALL ON FUNCTION public.dbk107_record_legacy_collection(jsonb) FROM PUBLIC;
