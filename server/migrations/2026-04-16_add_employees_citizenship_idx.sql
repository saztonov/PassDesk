-- Migration: Add index on employees.citizenship_id (FK without index)
-- Date: 2026-04-16
-- Reason: Live DB audit identified employees.citizenship_id as an unindexed
--         FK to citizenships(id). Used in JOINs for employee list and
--         counterparty document views. Without this index, CASCADE operations
--         and JOIN lookups result in seq scan.
-- Risk: LOW. Current table size is 137 rows — index build is nearly instant
--       (<50ms). Partial index on NOT NULL since 1/138 rows has NULL.
-- Expected effect: faster JOIN to citizenships, faster ON DELETE SET NULL
--                  behavior when citizenship is removed.
-- Rollback: DROP INDEX IF EXISTS public.idx_employees_citizenship_id;

CREATE INDEX IF NOT EXISTS idx_employees_citizenship_id
  ON public.employees USING btree (citizenship_id)
  WHERE citizenship_id IS NOT NULL;
