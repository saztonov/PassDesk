DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_role') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'enum_users_role' AND e.enumlabel = 'laborer'
    ) THEN
      ALTER TYPE public.enum_users_role ADD VALUE 'laborer';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_users_role_old') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'enum_users_role_old' AND e.enumlabel = 'laborer'
    ) THEN
      ALTER TYPE public.enum_users_role_old ADD VALUE 'laborer';
    END IF;
  END IF;
END $$;
