DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_files_document_type') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'enum_files_document_type' AND e.enumlabel = 'visa'
    ) THEN
      EXECUTE 'ALTER TYPE enum_files_document_type ADD VALUE ''visa''';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type_enum') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'document_type_enum' AND e.enumlabel = 'visa'
    ) THEN
      EXECUTE 'ALTER TYPE document_type_enum ADD VALUE ''visa''';
    END IF;
  END IF;
END $$;

INSERT INTO public.document_types (code, name, sort_order)
VALUES ('visa', 'Виза', 105)
ON CONFLICT (code) DO NOTHING;
