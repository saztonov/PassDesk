-- Migration: Drop 2 large unused SKUD indexes (36 MB total reclaim)
-- Date: 2026-04-16
--
-- ⚠️  PREREQUISITE: SKUD module must be disabled (SKUD_ENABLED=false) before
--     applying this migration. The polling should be stopped and no new events
--     should be inserted into skud_access_events for at least 10 minutes.
--
-- Reason: Live DB audit revealed these two indexes have idx_scan=0 on a
--         312K-row table, despite being declared with leading columns that
--         do not match actual query patterns in the application code:
--
--         idx_skud_access_events_system_employee_time (19 MB) declared as
--           (external_system, employee_id, event_time DESC)
--         Real query at counterparty.controller.js:1231 filters by
--           external_system + event_time (no employee_id), leading column
--           mismatch makes the index unusable.
--
--         idx_skud_access_events_point_time (17 MB) declared as
--           (access_point, event_time DESC)
--         Real query at counterparty.controller.js:1692 uses access_point
--           only in GROUP BY, not WHERE.
--
-- Risk: MEDIUM. Table is 609 MB — each DROP takes ACCESS EXCLUSIVE briefly
--       (~200-300 ms). Safe to run while SKUD is disabled since no queries
--       or inserts hit the table.
--
-- Rollback: see end of file. After rollback, reconsider replacing with
--           better-designed indexes that match actual query patterns:
--             CREATE INDEX ON skud_access_events (external_system, event_time DESC);

DROP INDEX IF EXISTS public.idx_skud_access_events_system_employee_time;
DROP INDEX IF EXISTS public.idx_skud_access_events_point_time;

-- ROLLBACK (if needed):
-- CREATE INDEX idx_skud_access_events_system_employee_time
--   ON public.skud_access_events USING btree (external_system, employee_id, event_time DESC);
-- CREATE INDEX idx_skud_access_events_point_time
--   ON public.skud_access_events USING btree (access_point, event_time DESC);
