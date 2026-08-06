BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS has_residence_permit boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.employees.has_residence_permit IS
  'Есть вид на жительство (ВНЖ) — патент не требуется';

COMMIT;
