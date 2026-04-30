-- Migration: Create service user for 1C sync
-- Date: 2026-04-28
-- After running: set SYNC_1C_USER_ID=00000000-0000-0000-0000-0000000011cc in server .env

INSERT INTO public.users (id, email, password, first_name, role, is_active, created_at, updated_at)
VALUES (
  '00000000-0000-0000-0000-0000000011cc',
  'sync-1c@system.local',
  'NOT_USED_NO_LOGIN',
  'Синхронизация 1С',
  'user',
  false,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- ROLLBACK:
-- DELETE FROM public.users WHERE id = '00000000-0000-0000-0000-0000000011cc';
