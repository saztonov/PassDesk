ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS planned_exit_date date;

COMMENT ON COLUMN public.employees.planned_exit_date
  IS 'Планируемая дата выхода сотрудника';

CREATE INDEX IF NOT EXISTS idx_employees_planned_exit_date
  ON public.employees USING btree (planned_exit_date);
