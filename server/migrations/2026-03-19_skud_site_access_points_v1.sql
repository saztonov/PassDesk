-- Таблица соответствия объектов PassDesk → точки доступа Sigur
CREATE TABLE IF NOT EXISTS skud_site_access_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  construction_site_id UUID NOT NULL REFERENCES construction_sites(id) ON DELETE CASCADE,
  sigur_access_point_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (construction_site_id, sigur_access_point_id)
);

CREATE INDEX IF NOT EXISTS idx_skud_site_access_points_site
  ON skud_site_access_points (construction_site_id);
