BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'enum_files_document_type'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'enum_files_document_type'
        AND e.enumlabel = 'passport_translation'
    ) THEN
      ALTER TYPE enum_files_document_type ADD VALUE 'passport_translation';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'enum_files_document_type'
        AND e.enumlabel = 'snils_card'
    ) THEN
      ALTER TYPE enum_files_document_type ADD VALUE 'snils_card';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'document_type_enum'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'document_type_enum'
        AND e.enumlabel = 'passport_translation'
    ) THEN
      ALTER TYPE document_type_enum ADD VALUE 'passport_translation';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'document_type_enum'
        AND e.enumlabel = 'snils_card'
    ) THEN
      ALTER TYPE document_type_enum ADD VALUE 'snils_card';
    END IF;
  END IF;
END $$;

INSERT INTO public.document_types (code, name, sort_order, is_active)
VALUES
  ('passport_translation', 'Перевод паспорта', 15, TRUE),
  ('snils_card', 'СНИЛС', 85, TRUE)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

UPDATE public.document_types
SET
  name = CASE code
    WHEN 'passport' THEN 'Паспорт'
    WHEN 'consent' THEN 'Согласие на перс.дан. Подрядчик'
    WHEN 'biometric_consent' THEN 'Согласие на перс.дан. Генподряд'
    WHEN 'biometric_consent_developer' THEN 'Согласие на перс.дан. Застройщ'
    WHEN 'bank_details' THEN 'Реквизиты счета'
    WHEN 'diploma' THEN 'Диплом'
    WHEN 'patent_front' THEN 'Патент (лиц.)'
    WHEN 'patent_back' THEN 'Патент (спин.)'
    WHEN 'arrival_notice' THEN 'Уведомление о прибытии'
    WHEN 'patent_payment_receipt' THEN 'Чек оплаты патента'
    WHEN 'visa' THEN 'Виза'
    ELSE name
  END,
  sort_order = CASE code
    WHEN 'passport' THEN 10
    WHEN 'passport_translation' THEN 15
    WHEN 'bank_details' THEN 20
    WHEN 'consent' THEN 30
    WHEN 'biometric_consent' THEN 40
    WHEN 'biometric_consent_developer' THEN 50
    WHEN 'diploma' THEN 80
    WHEN 'snils_card' THEN 85
    WHEN 'patent_front' THEN 100
    WHEN 'patent_back' THEN 110
    WHEN 'visa' THEN 120
    WHEN 'arrival_notice' THEN 130
    WHEN 'patent_payment_receipt' THEN 140
    ELSE sort_order
  END,
  updated_at = NOW()
WHERE code IN (
  'passport',
  'passport_translation',
  'bank_details',
  'consent',
  'biometric_consent',
  'biometric_consent_developer',
  'diploma',
  'snils_card',
  'patent_front',
  'patent_back',
  'visa',
  'arrival_notice',
  'patent_payment_receipt'
);

UPDATE public.document_types
SET
  is_active = FALSE,
  updated_at = NOW()
WHERE code IN ('kig', 'med_book', 'mvd_notification');

COMMIT;
