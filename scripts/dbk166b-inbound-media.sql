BEGIN;
ALTER TABLE public.dbk36_wa_messages
 ADD COLUMN IF NOT EXISTS media_id text,
 ADD COLUMN IF NOT EXISTS context_provider_id text,
 ADD COLUMN IF NOT EXISTS media_mime text,
 ADD COLUMN IF NOT EXISTS media_base64 text,
 ADD COLUMN IF NOT EXISTS media_attempt_at timestamptz;
ALTER TABLE public.dbk159_wa_outbound ADD COLUMN IF NOT EXISTS provider_message_id text;
CREATE INDEX IF NOT EXISTS dbk166b_outbound_provider ON public.dbk159_wa_outbound(wa_id,provider_message_id) WHERE provider_message_id IS NOT NULL;
COMMIT;
