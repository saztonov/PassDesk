ALTER TABLE public.construction_sites
  ADD COLUMN IF NOT EXISTS code character varying(10);

CREATE INDEX IF NOT EXISTS idx_construction_sites_code
  ON public.construction_sites USING btree (code);
