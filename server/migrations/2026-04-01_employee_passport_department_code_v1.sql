ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS passport_department_code VARCHAR(7);

COMMENT ON COLUMN employees.passport_department_code IS 'Код подразделения паспорта РФ в формате 111-222';
