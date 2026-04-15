-- Migration: Drop 14 unused (idx_scan = 0) small indexes
-- Date: 2026-04-16
-- Reason: Live DB audit (pg_stat_user_indexes) confirmed these indexes have
--         zero scans since database inception. Each DROP verified by agent
--         against source code (no WHERE/ORDER BY references or functional
--         equivalents exist).
-- Risk: LOW. Space reclaim ~5 MB. Brief ACCESS EXCLUSIVE per DROP.
-- NOTE: employees_id_all_key is EXCLUDED from this migration — it is a
--       UNIQUE CONSTRAINT (not just an index) and dropping it would remove
--       the uniqueness guarantee on id_all. Keep it.
-- Rollback: see end of file.

-- === Duplicates of hash-based UNIQUE indexes (UNIQUE versions are used) ===
-- idx_employees_passport_number_hash: 2.5 MB — duplicate of employees_passport_number_hash_unique (28 scans)
-- idx_employees_kig_hash: 168 kB — duplicate of employees_kig_hash_unique (26 scans)
DROP INDEX IF EXISTS public.idx_employees_passport_number_hash;
DROP INDEX IF EXISTS public.idx_employees_kig_hash;

-- === Date indexes on employees ===
-- Code wraps birth_date/passport_date/etc. in DATE(...) expressions (expiry-queries),
-- so btree indexes on these columns are not usable by planner anyway.
-- Verified: zero production scans on all of them.
DROP INDEX IF EXISTS public.idx_employees_birth_date;            -- 488 kB
DROP INDEX IF EXISTS public.idx_employees_passport_date;         -- 320 kB
DROP INDEX IF EXISTS public.idx_employees_passport_expiry_date;  -- 264 kB
DROP INDEX IF EXISTS public.idx_employees_patent_issue_date;     -- 176 kB
DROP INDEX IF EXISTS public.idx_employees_kig_end_date;          -- 16 kB
DROP INDEX IF EXISTS public.idx_employees_planned_exit_date;     -- 16 kB (added by server.js startup DDL hotfix)

-- === SNILS ===
-- Code uses ILIKE '%...%' for snils search (leading wildcard defeats btree).
-- UNIQUE on snils is enforced by a separate UNIQUE CONSTRAINT (employees_snils_unique)
-- which stays in place. This plain btree is pure dead weight.
DROP INDEX IF EXISTS public.idx_employees_snils;                 -- 592 kB

-- === Passes ===
-- Zero scans on both; valid_from/valid_until combo rarely filtered by range,
-- status is low cardinality (4 values) — planner prefers seq scan on small table.
DROP INDEX IF EXISTS public.passes_valid_from_valid_until;       -- 88 kB
DROP INDEX IF EXISTS public.passes_status;                       -- 48 kB

-- === Files ===
-- is_encrypted: no filter in application code grepped.
DROP INDEX IF EXISTS public.idx_files_is_encrypted;              -- 40 kB
-- files_file_key: regular UNIQUE INDEX, duplicate of UNIQUE CONSTRAINT files_file_key_key
-- (which we keep — it is a constraint backing index).
DROP INDEX IF EXISTS public.files_file_key;                      -- 208 kB

-- === Mapping tables — redundant with composite indexes ===
-- counterparty_construction_sites_mapping has both idx_ccm_* and
-- idx_counterparty_construction_mapping_* on the same columns — pure duplicates.
DROP INDEX IF EXISTS public.idx_ccm_construction_site_id;        -- 16 kB (duplicate)
DROP INDEX IF EXISTS public.idx_ccm_counterparty_id;             -- 16 kB (duplicate)

-- employee_counterparty_mapping: idx_emp_cp_mapping_employee_id is redundant
-- because idx_ecm_employee_counterparty_site (employee_id, counterparty_id, construction_site_id)
-- already covers lookups by employee_id as leading column.
DROP INDEX IF EXISTS public.idx_emp_cp_mapping_employee_id;      -- 1.1 MB

-- ROLLBACK templates (if specific indexes need to be restored):
-- CREATE INDEX idx_employees_passport_number_hash ON public.employees USING btree (passport_number_hash)
--   WHERE ((passport_number_hash IS NOT NULL) AND ((passport_number_hash)::text <> ''::text));
-- CREATE INDEX idx_employees_kig_hash ON public.employees USING btree (kig_hash)
--   WHERE ((kig_hash IS NOT NULL) AND ((kig_hash)::text <> ''::text));
-- CREATE INDEX idx_employees_birth_date ON public.employees USING btree (birth_date) WHERE (birth_date IS NOT NULL);
-- CREATE INDEX idx_employees_passport_date ON public.employees USING btree (passport_date) WHERE (passport_date IS NOT NULL);
-- CREATE INDEX idx_employees_passport_expiry_date ON public.employees USING btree (passport_expiry_date) WHERE (passport_expiry_date IS NOT NULL);
-- CREATE INDEX idx_employees_patent_issue_date ON public.employees USING btree (patent_issue_date) WHERE (patent_issue_date IS NOT NULL);
-- CREATE INDEX idx_employees_kig_end_date ON public.employees USING btree (kig_end_date) WHERE (kig_end_date IS NOT NULL);
-- CREATE INDEX idx_employees_planned_exit_date ON public.employees USING btree (planned_exit_date);
-- CREATE INDEX idx_employees_snils ON public.employees USING btree (snils);
-- CREATE INDEX passes_valid_from_valid_until ON public.passes USING btree (valid_from, valid_until);
-- CREATE INDEX passes_status ON public.passes USING btree (status);
-- CREATE INDEX idx_files_is_encrypted ON public.files USING btree (is_encrypted);
-- CREATE UNIQUE INDEX files_file_key ON public.files USING btree (file_key);
-- CREATE INDEX idx_ccm_construction_site_id ON public.counterparty_construction_sites_mapping USING btree (construction_site_id);
-- CREATE INDEX idx_ccm_counterparty_id ON public.counterparty_construction_sites_mapping USING btree (counterparty_id);
-- CREATE INDEX idx_emp_cp_mapping_employee_id ON public.employee_counterparty_mapping USING btree (employee_id);
