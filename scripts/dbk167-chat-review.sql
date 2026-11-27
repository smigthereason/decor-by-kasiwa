BEGIN;
ALTER TABLE public.dbk36_wa_conversations
  ADD COLUMN IF NOT EXISTS staff_review_reason text,
  ADD COLUMN IF NOT EXISTS delivery_context jsonb;
COMMIT;
