BEGIN;

UPDATE public.settings AS s
SET value = normalized.value::text,
    updated_at = NOW()
FROM (
  SELECT
    key,
    jsonb_build_object(
      'external',
      CASE
        WHEN jsonb_typeof(raw -> 'external') = 'array' THEN raw -> 'external'
        ELSE '[]'::jsonb
      END,
      'default_ru',
      CASE
        WHEN jsonb_typeof(raw -> 'default_ru') = 'array' THEN raw -> 'default_ru'
        WHEN jsonb_typeof(raw -> 'default_ru_by') = 'array' THEN raw -> 'default_ru_by'
        ELSE '[]'::jsonb
      END,
      'default_eaeu',
      CASE
        WHEN jsonb_typeof(raw -> 'default_eaeu') = 'array' THEN raw -> 'default_eaeu'
        WHEN jsonb_typeof(raw -> 'default_ru_by') = 'array' THEN raw -> 'default_ru_by'
        ELSE '[]'::jsonb
      END,
      'default_migrant',
      CASE
        WHEN jsonb_typeof(raw -> 'default_migrant') = 'array' THEN raw -> 'default_migrant'
        WHEN jsonb_typeof(raw -> 'default_foreign') = 'array' THEN raw -> 'default_foreign'
        ELSE '[]'::jsonb
      END
    ) AS value
  FROM (
    SELECT
      key,
      CASE
        WHEN value IS NULL OR btrim(value) = '' THEN '{}'::jsonb
        ELSE value::jsonb
      END AS raw
    FROM public.settings
    WHERE key = 'employee_document_profiles'
  ) source
) AS normalized
WHERE s.key = normalized.key
  AND s.key = 'employee_document_profiles';

COMMIT;
