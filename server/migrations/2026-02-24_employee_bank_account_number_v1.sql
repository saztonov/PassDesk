BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS bank_account_number character varying(20);

COMMENT ON COLUMN public.employees.bank_account_number
  IS 'Номер банковского счета сотрудника (20 цифр)';

COMMIT;
