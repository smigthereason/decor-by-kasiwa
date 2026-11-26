BEGIN;
CREATE TABLE IF NOT EXISTS public.dbk155_knowledge_versions (
 version bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'),
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.dbk155_wa_shortlists (
 wa_id text PRIMARY KEY,
 product_ids jsonb NOT NULL CHECK(jsonb_typeof(product_ids)='array'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
