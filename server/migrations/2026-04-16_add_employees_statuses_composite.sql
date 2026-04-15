-- Migration: Add composite index on employees_statuses_mapping
-- Date: 2026-04-16
-- Reason: Live DB audit via EXPLAIN ANALYZE confirmed status filter queries
--         use employees_statuses_mapping_status_group_idx as Index Scan with
--         Filter on (employee_id, is_active), instead of a single Index Cond.
--         The existing partial UNIQUE (employee_id, status_group) WHERE is_active=true
--         only covers queries where is_active = true literally; code uses
--         `is_active IS NOT FALSE` predicate which includes NULL, defeating
--         the partial index.
--         Covering INCLUDE (status_id) enables Index Only Scan for the common
--         lookup "what is the active status_id for employee X in group Y".
-- Risk: LOW. Current table size is 898 rows — index build is nearly instant
--       (<50ms). Brief ACCESS EXCLUSIVE, safe via standard runner.
-- Expected effect: Index Cond on (employee_id, status_group, is_active)
--                  instead of Index Scan + Filter. Important as the table grows.
-- Rollback: DROP INDEX IF EXISTS public.idx_esm_employee_group_active;

CREATE INDEX IF NOT EXISTS idx_esm_employee_group_active
  ON public.employees_statuses_mapping
  USING btree (employee_id, status_group, is_active)
  INCLUDE (status_id);
