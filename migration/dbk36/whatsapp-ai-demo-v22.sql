-- DBK36 v22: tiny request budget ledger in MAIN Neon, no customer data, no payment/stock writes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk36_wa_ai_demo_usage (
  actor_key text NOT NULL,
  day_utc date NOT NULL,
  requests integer NOT NULL DEFAULT 0 CHECK(requests>=0 AND requests<=100),
  PRIMARY KEY(actor_key,day_utc)
);
REVOKE ALL ON public.dbk36_wa_ai_demo_usage FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.dbk36_wa_ai_demo_admit(p_actor text)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER AS $f$
DECLARE d date:= (now() AT TIME ZONE 'UTC')::date;
        account_key text:=md5(coalesce(p_actor,''));
        global_count integer;
        actor_count integer;
BEGIN
 IF length(coalesce(p_actor,'')) < 2 OR length(p_actor)>180 THEN RETURN false; END IF;
 -- Serialize all reservations; cap at 100 requests/day globally, 20 per admin/day.
 PERFORM pg_advisory_xact_lock(hashtextextended('dbk36-ai-demo-daily',22));
 SELECT requests INTO global_count FROM public.dbk36_wa_ai_demo_usage
 WHERE actor_key='__global__' AND day_utc=d;
 IF coalesce(global_count,0)>=100 THEN RETURN false; END IF;
 SELECT requests INTO actor_count FROM public.dbk36_wa_ai_demo_usage
 WHERE actor_key=account_key AND day_utc=d;
 IF coalesce(actor_count,0)>=20 THEN RETURN false; END IF;
 INSERT INTO public.dbk36_wa_ai_demo_usage(actor_key,day_utc,requests)
 VALUES (account_key,d,1)
 ON CONFLICT(actor_key,day_utc) DO UPDATE SET requests=dbk36_wa_ai_demo_usage.requests+1;
 INSERT INTO public.dbk36_wa_ai_demo_usage(actor_key,day_utc,requests)
 VALUES ('__global__',d,1)
 ON CONFLICT(actor_key,day_utc) DO UPDATE SET requests=dbk36_wa_ai_demo_usage.requests+1;
 RETURN true;
END;
$f$;
REVOKE ALL ON FUNCTION public.dbk36_wa_ai_demo_admit(text) FROM PUBLIC;
COMMIT;
