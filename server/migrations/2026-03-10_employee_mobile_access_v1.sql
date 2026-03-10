BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_mobile_auth_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid NOT NULL,
  phone_normalized character varying(32) NOT NULL,
  code_hash character varying(128) NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  delivery_channel character varying(32) NOT NULL DEFAULT 'log',
  request_ip character varying(64),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT employee_mobile_auth_codes_pkey PRIMARY KEY (id),
  CONSTRAINT employee_mobile_auth_codes_employee_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employee_mobile_auth_codes_employee_id
  ON public.employee_mobile_auth_codes USING btree (employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_mobile_auth_codes_phone_expires
  ON public.employee_mobile_auth_codes USING btree (phone_normalized, expires_at DESC);

CREATE TABLE IF NOT EXISTS public.employee_mobile_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid NOT NULL,
  phone_normalized character varying(32) NOT NULL,
  token_hash character varying(128) NOT NULL,
  device_label character varying(128),
  request_ip character varying(64),
  user_agent text,
  last_seen_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT employee_mobile_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT employee_mobile_sessions_employee_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  CONSTRAINT employee_mobile_sessions_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_employee_mobile_sessions_employee_id
  ON public.employee_mobile_sessions USING btree (employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_mobile_sessions_expires_at
  ON public.employee_mobile_sessions USING btree (expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_mobile_sessions_phone
  ON public.employee_mobile_sessions USING btree (phone_normalized);

COMMIT;
