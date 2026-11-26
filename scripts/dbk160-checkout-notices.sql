BEGIN;
ALTER TABLE public.dbk155_wa_shortlists ADD COLUMN IF NOT EXISTS pending_purchase_product_id text;
ALTER TABLE public.dbk155_wa_shortlists ADD COLUMN IF NOT EXISTS pending_purchase_stage text CHECK (pending_purchase_stage IN ('offer','quantity'));
-- Existing historical paid orders do not receive unsolicited notifications.
ALTER TABLE public.dbk36_wa_prod_payment_orders ADD COLUMN IF NOT EXISTS payment_notice_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.dbk36_wa_prod_payment_orders ALTER COLUMN payment_notice_required SET DEFAULT true;
UPDATE public.dbk36_wa_prod_payment_orders SET payment_notice_required=true
WHERE status IN ('quoted','starting','prompt_sent','review_required') OR reference='DBKWAED4DAEC';
COMMIT;
