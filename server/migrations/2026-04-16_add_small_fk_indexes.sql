-- Migration: Add indexes on unindexed FK columns (small tables)
-- Date: 2026-04-16
-- Reason: Live DB audit identified 11 FK columns without supporting indexes.
--         This migration covers the 8 that live on small tables
--         (applications: 49 rows, contracts: 0 rows, users: 68 rows,
--          files.uploaded_by: 1184 rows).
--         Without these indexes, ON DELETE CASCADE and JOIN operations
--         result in seq scan of the child table.
-- Risk: LOW. All tables small; index build <500ms each. Tables are not
--       hot-read paths, so brief ACCESS EXCLUSIVE is tolerable.
-- Excluded: applications.subcontract_id — all 49 rows have NULL (unused
--           feature); index would be empty. Add later if subcontract
--           tracking becomes active.
-- Rollback: see end of file.

-- === applications (49 rows) ===
CREATE INDEX IF NOT EXISTS idx_applications_counterparty_id
  ON public.applications USING btree (counterparty_id);

CREATE INDEX IF NOT EXISTS idx_applications_construction_site_id
  ON public.applications USING btree (construction_site_id)
  WHERE construction_site_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_created_by
  ON public.applications USING btree (created_by);

-- === contracts (0 rows currently; NOT NULL FKs; cheap to create empty) ===
CREATE INDEX IF NOT EXISTS idx_contracts_construction_site_id
  ON public.contracts USING btree (construction_site_id);

CREATE INDEX IF NOT EXISTS idx_contracts_counterparty1_id
  ON public.contracts USING btree (counterparty1_id);

CREATE INDEX IF NOT EXISTS idx_contracts_counterparty2_id
  ON public.contracts USING btree (counterparty2_id);

-- === users (68 rows) ===
-- Column is nullable in schema but all 68 current rows have counterparty_id set.
-- Plain btree; if future NULLs grow, consider partial index migration.
CREATE INDEX IF NOT EXISTS idx_users_counterparty_id
  ON public.users USING btree (counterparty_id);

-- === files.uploaded_by (1184 rows) ===
-- Column is nullable but currently 100% non-null. Plain btree.
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by
  ON public.files USING btree (uploaded_by);

-- ROLLBACK:
-- DROP INDEX IF EXISTS public.idx_applications_counterparty_id;
-- DROP INDEX IF EXISTS public.idx_applications_construction_site_id;
-- DROP INDEX IF EXISTS public.idx_applications_created_by;
-- DROP INDEX IF EXISTS public.idx_contracts_construction_site_id;
-- DROP INDEX IF EXISTS public.idx_contracts_counterparty1_id;
-- DROP INDEX IF EXISTS public.idx_contracts_counterparty2_id;
-- DROP INDEX IF EXISTS public.idx_users_counterparty_id;
-- DROP INDEX IF EXISTS public.idx_files_uploaded_by;
