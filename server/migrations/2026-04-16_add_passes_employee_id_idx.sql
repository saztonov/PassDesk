-- Migration: Add index on passes.employee_id (critical FK)
-- Date: 2026-04-16
-- Reason: Live DB audit showed 50.13% of queries to passes table result in
--         Seq Scan (seq_scan=20799, seq_tup_read=23,313,144 on just 2157
--         live rows — each seq scan reads the entire table).
--         FK passes.employee_id -> employees(id) exists but has no supporting
--         index. Every JOIN or WHERE by employee_id forces full scan.
-- Risk: LOW. Table is small (2157 rows). Index build ~100ms ACCESS EXCLUSIVE.
-- Expected effect: Seq scan percentage drops to <5%, CASCADE deletes become
--                  index-driven instead of table-scan.
-- Rollback: DROP INDEX IF EXISTS public.idx_passes_employee_id;

CREATE INDEX IF NOT EXISTS idx_passes_employee_id
  ON public.passes USING btree (employee_id);
