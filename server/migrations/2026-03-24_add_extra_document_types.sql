BEGIN;

DO $$
DECLARE
  v_codes text[] := ARRAY['memo_approval', 'employment_history_stdr', 'registration_amina'];
  v_code text;
BEGIN
  FOREACH v_code IN ARRAY v_codes LOOP
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_files_document_type') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'enum_files_document_type' AND e.enumlabel = v_code
      ) THEN
        EXECUTE format('ALTER TYPE enum_files_document_type ADD VALUE %L', v_code);
      END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type_enum') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'document_type_enum' AND e.enumlabel = v_code
      ) THEN
        EXECUTE format('ALTER TYPE document_type_enum ADD VALUE %L', v_code);
      END IF;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.document_types (code, name, sort_order, is_active)
VALUES
  ('memo_approval', 'Служебная записка (согласование)', 140, TRUE),
  ('employment_history_stdr', 'Справка о трудовой деятельности работника (СТДР)', 150, TRUE),
  ('registration_amina', 'Регистрация (Амина)', 160, TRUE)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

COMMIT;
