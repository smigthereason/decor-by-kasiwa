-- DBK-59: ISOLATED dbk51-test branch ONLY. NEVER apply to production.
-- The function performs a genuine DBK-57 sale inside a PL/pgSQL
-- exception subtransaction, forcibly rolling back all resulting order,
-- payment and inventory writes before returning a success result.
-- DBK-51/56/57 gates must be disabled on entry and remain disabled.

CREATE OR REPLACE FUNCTION public.dbk59_rollback_manual_sale(
  p_request_key text, p_payload jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_sale jsonb;
  v_stock_gate boolean;
  v_ledger_gate boolean;
  v_manual_gate boolean;
BEGIN
  -- Strictly synthetic candidates, not independent proof of cash receipt.
  IF p_request_key IS NULL OR p_request_key NOT LIKE 'dbk58-manual-%'
     OR length(p_request_key)>120
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR p_payload->'cashierConfirmed' IS DISTINCT FROM 'true'::jsonb
     OR p_payload->'order'->>'channel' IS DISTINCT FROM 'POS'
     OR p_payload->'order'->>'currency' IS DISTINCT FROM 'KES'
     OR left(coalesce(p_payload->'order'->>'orderNumber',''),11) <> 'DBK58-TEST-'
     OR left(coalesce(p_payload->'payment'->>'providerReference',''),11) <> 'DBK58-TEST-'
     OR left(coalesce(p_payload->'payment'->>'evidenceReference',''),10) <> 'synthetic-'
  THEN RAISE EXCEPTION 'DBK-59 requires a synthetic manual preview'; END IF;

  -- Serialize diagnostic exercises. The gates are written then reset
  -- inside ONE SQL transaction; other connections never observe them ON.
  PERFORM pg_advisory_xact_lock(hashtextextended('dbk59:rollback-only',59));
  SELECT writes_enabled INTO v_stock_gate FROM public.dbk51_stock_engine_config WHERE singleton FOR UPDATE;
  SELECT enabled INTO v_ledger_gate FROM public.dbk56_ledger_config WHERE singleton FOR UPDATE;
  SELECT enabled INTO v_manual_gate FROM public.dbk57_manual_sale_config WHERE singleton FOR UPDATE;
  IF v_stock_gate IS DISTINCT FROM false OR
     v_ledger_gate IS DISTINCT FROM false OR
     v_manual_gate IS DISTINCT FROM false OR
     NOT EXISTS (SELECT 1 FROM public.dbk51_stock_engine_config
                 WHERE singleton AND seed_fingerprint IS NOT NULL)
  THEN RAISE EXCEPTION 'DBK-59 requires a seeded test branch with all write gates OFF'; END IF;

  UPDATE public.dbk51_stock_engine_config SET writes_enabled=true,updated_at=now() WHERE singleton;
  UPDATE public.dbk56_ledger_config SET enabled=true,updated_at=now() WHERE singleton;
  UPDATE public.dbk57_manual_sale_config SET enabled=true,updated_at=now() WHERE singleton;

  -- EXCEPTION creates a savepoint/subtransaction. Raising our distinctive
  -- SQLSTATE ensures ALL child function side-effects roll back together.
  BEGIN
    v_sale := public.dbk57_record_manual_sale(p_request_key, p_payload);
    RAISE EXCEPTION USING ERRCODE='ZX591', MESSAGE='DBK59_FORCED_ROLLBACK';
  EXCEPTION WHEN SQLSTATE 'ZX591' THEN
    NULL; -- The inner sale was successfully exercised and fully reversed.
  END;

  UPDATE public.dbk57_manual_sale_config SET enabled=false,updated_at=now() WHERE singleton;
  UPDATE public.dbk56_ledger_config SET enabled=false,updated_at=now() WHERE singleton;
  UPDATE public.dbk51_stock_engine_config SET writes_enabled=false,updated_at=now() WHERE singleton;

  IF v_sale IS NULL OR v_sale->>'stockCommitted' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'DBK-59 trial did not complete';
  END IF;
  RETURN jsonb_build_object(
    'rolledBack',true,
    'stockCommittedInTrial',true,
    'totalMinor',v_sale->'totalMinor',
    'financialStatus',v_sale->'financialStatus',
    'balanceDueMinor',v_sale->'balanceDueMinor',
    'overpaidMinor',v_sale->'overpaidMinor'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dbk59_rollback_manual_sale(text,jsonb) FROM PUBLIC;
