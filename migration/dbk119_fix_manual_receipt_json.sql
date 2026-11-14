-- DBK-119: Repair the production DBK-62 receipt validation operator precedence.
-- Database-only; no stock, order, payment, gate, or configuration row is changed.
-- Do not execute the original dbk62-cutover.sql in production to apply this fix.
-- Idempotent: already-fixed function is accepted without modification.
DO $dbk119$
DECLARE
  v_function text;
  v_before text := $old$p_display->>'receiptNumber' <> 'RCT-' || p_payload->'order'->>'orderNumber'$old$;
  v_after text := $new$(p_display->>'receiptNumber') <> ('RCT-'::text || (p_payload->'order'->>'orderNumber'))$new$;
BEGIN
  PERFORM pg_advisory_xact_lock(119, 62);
  SELECT pg_get_functiondef(to_regprocedure('public.dbk62_record_real_manual_sale(text,jsonb,jsonb)'))
    INTO v_function;
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'DBK119_ABORT: manual-sale function does not exist';
  END IF;
  IF position(v_after IN v_function) > 0 THEN
    RAISE NOTICE 'DBK119_ALREADY_FIXED';
  ELSIF position(v_before IN v_function) = 0 OR
     position(v_before IN substring(v_function FROM position(v_before IN v_function) + length(v_before))) > 0 OR
     position('PERFORM pg_advisory_xact_lock' IN v_function) = 0 OR
     position('public.dbk57_record_manual_sale' IN v_function) = 0 OR
     position('DBK-62 refuses invalid real-sale contract' IN v_function) = 0 THEN
    RAISE EXCEPTION 'DBK119_ABORT: function differs from reviewed source; no change made';
  ELSE
    EXECUTE replace(v_function, v_before, v_after);
    RAISE NOTICE 'DBK119_APPLIED: only receipt expression changed';
  END IF;
END
$dbk119$;
