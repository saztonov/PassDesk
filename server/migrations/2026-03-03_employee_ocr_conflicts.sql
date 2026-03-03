CREATE TABLE IF NOT EXISTS public.employee_ocr_conflicts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid NOT NULL,
  file_id uuid NOT NULL,
  document_type varchar(64) NULL,
  ocr_document_type varchar(64) NULL,
  field_name varchar(64) NOT NULL,
  field_label varchar(128) NOT NULL,
  current_value text NULL,
  ocr_value text NULL,
  status varchar(16) NOT NULL DEFAULT 'open',
  created_by uuid NULL,
  resolved_by uuid NULL,
  resolved_at timestamptz NULL,
  notification_sent_at timestamptz NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_ocr_conflicts_pkey PRIMARY KEY (id),
  CONSTRAINT employee_ocr_conflicts_employee_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  CONSTRAINT employee_ocr_conflicts_file_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE,
  CONSTRAINT employee_ocr_conflicts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT employee_ocr_conflicts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT employee_ocr_conflicts_status_check CHECK (status IN ('open', 'resolved')),
  CONSTRAINT employee_ocr_conflicts_unique_file_field UNIQUE (employee_id, file_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_employee_ocr_conflicts_employee_status
  ON public.employee_ocr_conflicts (employee_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_ocr_conflicts_status_created
  ON public.employee_ocr_conflicts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_ocr_conflicts_file_id
  ON public.employee_ocr_conflicts (file_id);
