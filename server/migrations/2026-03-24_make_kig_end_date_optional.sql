BEGIN;

UPDATE public.settings
SET value = jsonb_set(value::jsonb, '{kigEndDate,required}', 'false'::jsonb)::text,
    updated_at = NOW()
WHERE key IN ('employee_form_config_default', 'employee_form_config_external')
  AND value IS NOT NULL
  AND jsonb_typeof(value::jsonb) = 'object'
  AND value::jsonb ? 'kigEndDate';

COMMIT;
