BEGIN;

ALTER TABLE public.employee_counterparty_mapping
  ADD COLUMN IF NOT EXISTS dismissed_at timestamp with time zone;

COMMENT ON COLUMN public.employee_counterparty_mapping.dismissed_at
  IS 'Последняя актуальная дата увольнения сотрудника у контрагента';

CREATE INDEX IF NOT EXISTS idx_employee_counterparty_mapping_dismissed_at
  ON public.employee_counterparty_mapping USING btree (dismissed_at);

COMMIT;
