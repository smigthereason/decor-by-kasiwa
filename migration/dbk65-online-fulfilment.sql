-- DBK-65: online fulfilment, separate from money and stock. Default disabled.
-- Only install on isolated test branch until cross-flow launch tests pass.
CREATE TABLE IF NOT EXISTS public.dbk65_online_fulfilment_config(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.dbk65_online_fulfilment_config(singleton,enabled) VALUES(true,false)
ON CONFLICT(singleton) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.dbk65_online_fulfilment(
 order_id text PRIMARY KEY REFERENCES public.dbk64_online_orders(order_id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','processing','ready_for_store','picking','packed','dispatched','delivered')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 dispatched_at timestamptz,dispatched_by_name text,delivered_at timestamptz,
 actor_id text NOT NULL, actor_name text NOT NULL
);
CREATE OR REPLACE FUNCTION public.dbk65_transition_online_fulfilment(p_order_id text,
 p_status text,p_actor_id text,p_actor_name text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v_order public.dbk64_online_orders%ROWTYPE; v_state text; v_expected text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.dbk65_online_fulfilment_config x
    JOIN public.dbk62_cutover_config b ON b.singleton=x.singleton
    WHERE x.singleton AND x.enabled AND b.enabled AND b.all_stock_writers_switched)
 THEN RAISE EXCEPTION 'DBK-65 fulfilment cutover disabled'; END IF;
 IF p_order_id !~ '^dbk64[.]order[.]DBK64-[0-9]{10,15}-[a-f0-9]{10}$' OR
    coalesce(p_actor_id,'')='' OR coalesce(p_actor_name,'')='' OR
    p_status NOT IN ('processing','ready_for_store','picking','packed','dispatched')
 THEN RAISE EXCEPTION 'Invalid DBK-65 order transition'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('dbk65:'||p_order_id,65));
 SELECT * INTO v_order FROM public.dbk64_online_orders WHERE order_id=p_order_id FOR UPDATE;
 IF NOT FOUND OR v_order.payment_status<>'PAID' OR v_order.stock_status<>'COMMITTED'
 THEN RAISE EXCEPTION 'Only paid, stock-committed orders may be fulfilled'; END IF;
 SELECT status INTO v_state FROM public.dbk65_online_fulfilment WHERE order_id=p_order_id FOR UPDATE;
 v_state:=coalesce(v_state,'paid');
 IF v_state=p_status THEN RETURN jsonb_build_object('status',v_state,'replayed',true); END IF;
 v_expected:=CASE p_status
   WHEN 'processing' THEN 'paid'
   WHEN 'ready_for_store' THEN 'processing'
   WHEN 'picking' THEN 'ready_for_store'
   WHEN 'packed' THEN 'picking'
   WHEN 'dispatched' THEN 'packed' END;
 IF v_state IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Invalid fulfilment transition % to %',v_state,p_status;
 END IF;
 INSERT INTO public.dbk65_online_fulfilment(order_id,status,actor_id,actor_name,
     dispatched_at,dispatched_by_name)
 VALUES(p_order_id,p_status,p_actor_id,p_actor_name,
     CASE WHEN p_status='dispatched' THEN now() END,
     CASE WHEN p_status='dispatched' THEN p_actor_name END)
 ON CONFLICT(order_id) DO UPDATE SET status=excluded.status,actor_id=excluded.actor_id,
     actor_name=excluded.actor_name,updated_at=now(),
     dispatched_at=CASE WHEN p_status='dispatched' THEN now() ELSE public.dbk65_online_fulfilment.dispatched_at END,
     dispatched_by_name=CASE WHEN p_status='dispatched' THEN p_actor_name ELSE public.dbk65_online_fulfilment.dispatched_by_name END;
 RETURN jsonb_build_object('status',p_status,'replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.dbk65_transition_online_fulfilment(text,text,text,text) FROM PUBLIC;
