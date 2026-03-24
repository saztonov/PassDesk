ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bank_bik VARCHAR(9);

COMMENT ON COLUMN employees.bank_bik IS 'БИК банка (9 цифр)';
