BEGIN;

ALTER TABLE public.employees
  ALTER COLUMN last_name DROP NOT NULL;

COMMIT;
