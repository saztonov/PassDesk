BEGIN;

INSERT INTO public.document_types (code, name, sort_order, is_active)
VALUES
  ('kig', 'КИГ', 25, TRUE),
  ('consent', 'Согласие на перс.дан. Подрядчик', 30, TRUE)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

COMMIT;
