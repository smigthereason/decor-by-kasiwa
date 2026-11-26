BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk163_wa_staff_read (
  wa_id text NOT NULL REFERENCES public.dbk36_wa_conversations(wa_id),
  staff_id text NOT NULL,
  last_read_message_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wa_id, staff_id)
);
COMMIT;
