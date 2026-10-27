-- DBK-48A: new independent audit events only. No Sanity mutation, no cleanup.
-- Apply once to Neon production before enabling DBK_AUDIT_WRITE_BACKEND=neon.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk_live_audit_events (
  id text PRIMARY KEY,
  payload_hash text NOT NULL,
  document_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dbk48_audit_json_type CHECK (jsonb_typeof(document_json) = 'object'),
  CONSTRAINT dbk48_audit_event_type CHECK (document_json->>'_type' = 'auditEvent'),
  CONSTRAINT dbk48_audit_document_id CHECK (document_json->>'_id' = id)
);
CREATE INDEX IF NOT EXISTS dbk48_live_audit_events_created_at_idx
  ON public.dbk_live_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS dbk48_live_audit_events_actor_idx
  ON public.dbk_live_audit_events ((document_json->'actor'->>'_ref'), created_at DESC);
COMMENT ON TABLE public.dbk_live_audit_events IS
  'DBK-48A independent audit events written directly to Neon; distinct from immutable DBK-46 historical snapshots.';
COMMIT;
