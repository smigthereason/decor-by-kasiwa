-- DBK-74: Install on the VERIFIED Neon production branch only.
-- Safe initial state ACTIVE=FALSE. Does not touch financial gates or customer data.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk74_freeze_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  operator_note text NOT NULL DEFAULT ''
);
INSERT INTO public.dbk74_freeze_control (singleton,active,operator_note)
VALUES (true,false,'DBK74 installed, maintenance inactive')
ON CONFLICT (singleton) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.dbk74_queued_callbacks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('daraja','paystack')),
  content_hash text NOT NULL UNIQUE CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  request_path text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  reconciliation_status text NOT NULL DEFAULT 'PENDING' CHECK (reconciliation_status IN ('PENDING','RECONCILED','REJECTED')),
  reconciled_at timestamptz,
  operator_note text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS dbk74_callbacks_status_idx ON public.dbk74_queued_callbacks(reconciliation_status,received_at);
REVOKE ALL ON public.dbk74_freeze_control FROM PUBLIC;
REVOKE ALL ON public.dbk74_queued_callbacks FROM PUBLIC;
COMMIT;
SELECT current_database() AS database, active, updated_at,
  (SELECT count(*) FROM public.dbk74_queued_callbacks WHERE reconciliation_status='PENDING') AS pending_callbacks
FROM public.dbk74_freeze_control WHERE singleton=true;
