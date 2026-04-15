-- Migration: Drop duplicate UNIQUE constraints on users.email
-- Date: 2026-04-16
-- Reason: Live DB audit revealed 4 UNIQUE constraints on users.email
--         (users_email_key, users_email_key1, users_email_key2, users_email_key3).
--         Each backed by its own btree index — 3 are pure duplicates wasting
--         storage and adding write overhead on every INSERT/UPDATE to users.
-- Risk: LOW. Drops 3 of 4 duplicate constraints, keeps users_email_key as
--       the canonical UNIQUE on email. Uniqueness guarantee preserved.
-- Lock: brief ACCESS EXCLUSIVE on users (~50ms per constraint, ~150ms total).
-- Rollback: see end of file.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key1;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key2;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key3;

-- ROLLBACK (if needed):
-- ALTER TABLE public.users ADD CONSTRAINT users_email_key1 UNIQUE (email);
-- ALTER TABLE public.users ADD CONSTRAINT users_email_key2 UNIQUE (email);
-- ALTER TABLE public.users ADD CONSTRAINT users_email_key3 UNIQUE (email);
-- (Rollback NOT recommended — these are pure duplicates.)
