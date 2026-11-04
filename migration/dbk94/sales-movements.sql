-- DBK-94 / Production Neon only. Create a movement EVIDENCE table, not a
-- second stock engine. Do not enable any DBK-51/62/64/68/69 write gate here.
CREATE TABLE IF NOT EXISTS public.dbk94_sale_movements (
  movement_id text PRIMARY KEY,
  order_id text NOT NULL,
  entry_sha256 text NOT NULL CHECK (entry_sha256 ~ '^[0-9a-f]{64}$'),
  movement_json jsonb NOT NULL,
  projected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dbk94_sale_movements_order_id_idx
  ON public.dbk94_sale_movements(order_id);
-- Restrict table writes to the existing production server-side database role.
