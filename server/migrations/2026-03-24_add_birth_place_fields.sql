BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS birth_region text,
  ADD COLUMN IF NOT EXISTS birth_city text;

COMMENT ON COLUMN public.employees.birth_region IS 'Область / регион рождения';
COMMENT ON COLUMN public.employees.birth_city IS 'Населённый пункт рождения';

COMMIT;
