BEGIN;

ALTER TABLE public.citizenships
  ADD COLUMN IF NOT EXISTS is_eaeu boolean NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.citizenships.is_eaeu IS
  'Относится ли гражданство к странам ЕАЭС (без РФ)';

UPDATE public.citizenships
SET is_eaeu = TRUE
WHERE
  UPPER(COALESCE(code, '')) IN ('BLR', 'BY', '112', 'RB', 'KAZ', 'KZ', '398', 'KGZ', 'KG', '417', 'ARM', 'AM', '051')
  OR name ILIKE 'Беларус%'
  OR name ILIKE 'Белорус%'
  OR name ILIKE 'Казах%'
  OR name ILIKE 'Киргиз%'
  OR name ILIKE 'Кыргыз%'
  OR name ILIKE 'Армени%';

UPDATE public.citizenships
SET is_eaeu = FALSE
WHERE
  UPPER(COALESCE(code, '')) IN ('RUS', 'RU', '643')
  OR name ILIKE 'Рос%'
  OR name ILIKE 'Russia%';

UPDATE public.citizenships
SET requires_patent = FALSE
WHERE is_eaeu = TRUE;

COMMIT;
