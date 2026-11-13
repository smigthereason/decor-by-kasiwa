-- DBK-36A: additive, isolated WhatsApp inbox. Apply in Neon with reviewed credentials.
-- No existing commerce tables or financial records are changed by this migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk36_wa_conversations (
  wa_id TEXT PRIMARY KEY CHECK (wa_id ~ '^[0-9]{7,16}$'),
  display_name TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'bot' CHECK (mode IN ('bot','human')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.dbk36_wa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_id TEXT NOT NULL REFERENCES public.dbk36_wa_conversations(wa_id),
  provider_message_id TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','unsupported')),
  message_text TEXT NOT NULL DEFAULT '',
  media_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','sent','failed')),
  attempts INT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dbk36_wa_messages_work_idx
  ON public.dbk36_wa_messages (status, next_attempt_at, created_at)
  WHERE direction = 'in';
CREATE INDEX IF NOT EXISTS dbk36_wa_messages_chat_idx
  ON public.dbk36_wa_messages (wa_id, created_at DESC);
COMMIT;
