BEGIN;

ALTER TABLE public.employees
  DROP COLUMN IF EXISTS bank_account_number;

COMMIT;
