BEGIN;

-- Full-encryption hardening:
-- remove plaintext values for sensitive employee fields after encrypted copies exist.
UPDATE public.employees
SET last_name = NULL
WHERE last_name IS NOT NULL
  AND last_name_enc IS NOT NULL
  AND last_name_hash IS NOT NULL
  AND last_name_key_version IS NOT NULL;

UPDATE public.employees
SET passport_number = NULL
WHERE passport_number IS NOT NULL
  AND passport_number_enc IS NOT NULL
  AND passport_number_hash IS NOT NULL
  AND passport_number_key_version IS NOT NULL;

UPDATE public.employees
SET kig = NULL
WHERE kig IS NOT NULL
  AND kig_enc IS NOT NULL
  AND kig_hash IS NOT NULL
  AND kig_key_version IS NOT NULL;

UPDATE public.employees
SET patent_number = NULL
WHERE patent_number IS NOT NULL
  AND patent_number_enc IS NOT NULL
  AND patent_number_hash IS NOT NULL
  AND patent_number_key_version IS NOT NULL;

COMMIT;
