BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS insurance_policy_number character varying(64),
  ADD COLUMN IF NOT EXISTS insurance_policy_date date;

COMMENT ON COLUMN public.employees.insurance_policy_number
  IS 'Номер страхового полиса';

COMMENT ON COLUMN public.employees.insurance_policy_date
  IS 'Дата выдачи страхового полиса';

INSERT INTO public.document_types (code, name, sort_order)
VALUES ('insurance_policy', 'Страховой полис', 135)
ON CONFLICT (code) DO NOTHING;

COMMIT;
