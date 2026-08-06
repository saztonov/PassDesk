BEGIN;

ALTER TABLE public.employees
  DROP COLUMN IF EXISTS has_residence_permit;

COMMIT;
