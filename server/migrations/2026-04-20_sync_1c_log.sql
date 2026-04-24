-- Migration: Create sync_1c_log table for 1C bidirectional sync journal
-- Date: 2026-04-20

CREATE TABLE IF NOT EXISTS public.sync_1c_log (
  id          BIGSERIAL PRIMARY KEY,
  run_id      UUID        NOT NULL,
  direction   TEXT        NOT NULL CHECK (direction IN ('from_1c', 'to_1c')),
  entity_type TEXT        NOT NULL,
  entity_id   TEXT        NOT NULL,
  status      TEXT        NOT NULL CHECK (status IN ('created', 'updated', 'skipped', 'conflict', 'error')),
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_1c_log_run_id    ON public.sync_1c_log (run_id);
CREATE INDEX IF NOT EXISTS idx_sync_1c_log_created_at ON public.sync_1c_log (created_at DESC);

COMMENT ON TABLE  public.sync_1c_log                IS 'Журнал синхронизации с 1С';
COMMENT ON COLUMN public.sync_1c_log.run_id         IS 'UUID сессии синхронизации';
COMMENT ON COLUMN public.sync_1c_log.direction      IS 'from_1c — данные пришли из 1С; to_1c — данные отданы в 1С';
COMMENT ON COLUMN public.sync_1c_log.entity_type    IS 'Тип сущности: employee, department';
COMMENT ON COLUMN public.sync_1c_log.entity_id      IS 'id_all сущности в источнике';
COMMENT ON COLUMN public.sync_1c_log.status         IS 'Результат обработки записи';
COMMENT ON COLUMN public.sync_1c_log.detail         IS 'Детали: конфликтные поля, сообщение об ошибке и т.п.';

-- ROLLBACK:
-- DROP TABLE IF EXISTS public.sync_1c_log;
