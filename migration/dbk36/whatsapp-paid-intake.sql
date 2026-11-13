-- DBK-36 v7: ADDITIVE production paid-order intake. MAIN Neon only.
-- Does not enable DBK-51/55/56/62/69 or deduct/hold stock, place an order in POS,
-- mark paid from a webhook, or make a payment. Manual staff-till reconciliation only.
-- Schema deployment deliberately leaves the intake write gate disabled.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk36_wa_paid_intake_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk36_wa_paid_intake_config(singleton,enabled)
VALUES(true,false) ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.dbk36_wa_paid_intake (
  reference text PRIMARY KEY CHECK(reference ~ '^DBKWA[A-Z0-9]{7}$'),
  checkout_id text NOT NULL UNIQUE,
  provider_receipt text NOT NULL UNIQUE,
  merchant_id text NOT NULL,
  wa_id text NOT NULL CHECK(wa_id ~ '^254(7|1)[0-9]{8}$'),
  amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 100 AND 50000),
  paid_at timestamptz NOT NULL,
  cart_snapshot jsonb NOT NULL CHECK(jsonb_typeof(cart_snapshot)='array' AND jsonb_array_length(cart_snapshot) BETWEEN 1 AND 12),
  intake_status text NOT NULL DEFAULT 'AWAITING_STAFF_STOCK_REVIEW'
     CHECK(intake_status IN ('AWAITING_STAFF_STOCK_REVIEW','CANCELLED_REFUND_REVIEW','HANDLED_MANUALLY')),
  verification_mode text NOT NULL CHECK(verification_mode='staff_till_attested'),
  attested_by text NOT NULL,
  attested_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dbk36_wa_paid_intake_created_idx
ON public.dbk36_wa_paid_intake(created_at DESC);

CREATE OR REPLACE FUNCTION public.dbk36_wa_record_paid_intake(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $body$
DECLARE
 r text := p->>'reference'; c text:=p->>'checkoutId'; pr text:=p->>'receipt';
 m text:=p->>'merchantId'; phone text:=p->>'waId'; amt text:=p->>'amountMinor';
 signer text:=p->>'attestedBy'; t timestamptz; existing public.dbk36_wa_paid_intake%ROWTYPE;
 line jsonb; sum_minor bigint := 0; unit_minor bigint; qty integer;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object'
 OR (p - 'reference' - 'checkoutId' - 'receipt' - 'merchantId' - 'waId'
       - 'amountMinor' - 'paidAt' - 'cart' - 'attestedBy' - 'verificationMode') <> '{}'::jsonb
 OR coalesce(r,'') !~ '^DBKWA[A-Z0-9]{7}$'
 OR coalesce(c,'') !~ '^[A-Za-z0-9._:-]{6,180}$'
 OR coalesce(pr,'') !~ '^[A-Za-z0-9-]{6,30}$'
 OR length(coalesce(m,'')) NOT BETWEEN 6 AND 180
 OR coalesce(phone,'') !~ '^254(7|1)[0-9]{8}$'
 OR length(coalesce(signer,'')) NOT BETWEEN 2 AND 180
 OR p->>'verificationMode' IS DISTINCT FROM 'staff_till_attested'
 OR jsonb_typeof(p->'amountMinor') IS DISTINCT FROM 'number'
 OR coalesce(amt,'') !~ '^[1-9][0-9]*$' OR length(amt)>5
 OR amt::bigint NOT BETWEEN 100 AND 50000
 OR jsonb_typeof(p->'cart') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'DBK36_INTAKE_CONTRACT_INVALID'; END IF;
 IF jsonb_array_length(p->'cart') NOT BETWEEN 1 AND 12
 THEN RAISE EXCEPTION 'DBK36_CART_INVALID'; END IF;
 BEGIN
   t:=(p->>'paidAt')::timestamptz;
   IF t IS NULL OR t>now()+interval '5 minutes' OR t<now()-interval '120 days'
   THEN RAISE EXCEPTION 'DBK36_PAID_DATE_INVALID'; END IF;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
   RAISE EXCEPTION 'DBK36_PAID_DATE_INVALID';
 END;
 FOR line IN SELECT value FROM jsonb_array_elements(p->'cart') LOOP
   IF jsonb_typeof(line) IS DISTINCT FROM 'object'
   OR (line - 'productId' - 'quantity' - 'subtotalMinor' - 'variantId') <> '{}'::jsonb
   OR length(coalesce(line->>'productId','')) NOT BETWEEN 1 AND 180
   OR jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number'
   OR jsonb_typeof(line->'subtotalMinor') IS DISTINCT FROM 'number'
   OR coalesce(line->>'quantity','') !~ '^[1-9][0-9]*$'
   OR coalesce(line->>'subtotalMinor','') !~ '^[1-9][0-9]*$'
   OR length(line->>'quantity')>2 OR length(line->>'subtotalMinor')>7
   OR length(coalesce(line->>'variantId',''))>180
   THEN RAISE EXCEPTION 'DBK36_CART_LINE_INVALID'; END IF;
   qty:=(line->>'quantity')::integer;
   unit_minor:=(line->>'subtotalMinor')::bigint;
   IF qty>20 OR unit_minor % qty <> 0 THEN RAISE EXCEPTION 'DBK36_CART_LINE_INVALID'; END IF;
   sum_minor:=sum_minor+unit_minor;
 END LOOP;
 IF sum_minor <> amt::bigint THEN RAISE EXCEPTION 'DBK36_CART_TOTAL_MISMATCH'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('dbk36-intake:'||r, 36));
 SELECT * INTO existing FROM public.dbk36_wa_paid_intake WHERE reference=r FOR UPDATE;
 IF FOUND THEN
   IF existing.checkout_id<>c OR existing.provider_receipt<>pr
     OR existing.amount_minor<>amt::bigint OR existing.wa_id<>phone
     OR existing.cart_snapshot IS DISTINCT FROM p->'cart'
   THEN RAISE EXCEPTION 'DBK36_INTAKE_CONFLICTING_REPLAY'; END IF;
   RETURN jsonb_build_object('reference',r,'status',existing.intake_status,'replayed',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dbk36_wa_paid_intake_config WHERE singleton AND enabled)
 THEN RAISE EXCEPTION 'DBK36_INTAKE_DISABLED'; END IF;
 -- Cross-ledger duplicate detection. Existing POS and M-Pesa ledgers are READ ONLY here.
 IF EXISTS(SELECT 1 FROM public.dbk56_pos_payments WHERE provider='daraja' AND provider_reference=pr)
 OR EXISTS(SELECT 1 FROM public.dbk55_paid_pos_settlements WHERE payment_provider='daraja'
   AND (provider_receipt=pr OR provider_payment_id=c))
 OR EXISTS(SELECT 1 FROM public.dbk68_daraja_orders WHERE receipt_number=pr OR checkout_id=c)
 THEN RAISE EXCEPTION 'DBK36_PAYMENT_ALREADY_RECORDED'; END IF;
 INSERT INTO public.dbk36_wa_paid_intake
 (reference,checkout_id,provider_receipt,merchant_id,wa_id,amount_minor,paid_at,
  cart_snapshot,verification_mode,attested_by)
 VALUES(r,c,pr,m,phone,amt::bigint,t,p->'cart','staff_till_attested',signer);
 RETURN jsonb_build_object('reference',r,'status','AWAITING_STAFF_STOCK_REVIEW','replayed',false);
END;
$body$;
REVOKE ALL ON FUNCTION public.dbk36_wa_record_paid_intake(jsonb) FROM PUBLIC;
REVOKE ALL ON public.dbk36_wa_paid_intake_config FROM PUBLIC;
REVOKE ALL ON public.dbk36_wa_paid_intake FROM PUBLIC;
COMMIT;
