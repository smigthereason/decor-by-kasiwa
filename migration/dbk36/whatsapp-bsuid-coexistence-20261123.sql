-- DBK36: allow YCloud Business-Scoped User IDs for messaging only.
-- No payment, inventory, POS or orders tables are altered.
-- Run first on a disposable Neon branch and inspect the constraint state.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.dbk36_wa_conversations'::regclass
      AND conname='dbk36_wa_conversations_wa_id_bsuid_check'
  ) THEN
    ALTER TABLE public.dbk36_wa_conversations
      ADD CONSTRAINT dbk36_wa_conversations_wa_id_bsuid_check
      CHECK (wa_id ~ '^[0-9]{7,16}$' OR wa_id ~ '^[A-Z]{2}[.][0-9]{6,32}$')
      NOT VALID;
  END IF;
END $$;
ALTER TABLE public.dbk36_wa_conversations
  VALIDATE CONSTRAINT dbk36_wa_conversations_wa_id_bsuid_check;
ALTER TABLE public.dbk36_wa_conversations
  DROP CONSTRAINT IF EXISTS dbk36_wa_conversations_wa_id_check;
COMMIT;
