ALTER TABLE public.construction_sites
  ALTER COLUMN full_name DROP NOT NULL,
  ALTER COLUMN address DROP NOT NULL;
