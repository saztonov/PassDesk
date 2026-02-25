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
        AND e.enumlabel = 'inn_document'
    ) THEN
      ALTER TYPE enum_files_document_type ADD VALUE 'inn_document';
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
        AND e.enumlabel = 'inn_document'
    ) THEN
      ALTER TYPE document_type_enum ADD VALUE 'inn_document';
    END IF;
  END IF;
END $$;

INSERT INTO public.document_types (code, name, sort_order, is_active)
VALUES ('inn_document', 'ИНН', 18, TRUE)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

COMMIT;
