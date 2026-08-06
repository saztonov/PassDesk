--
-- PostgreSQL database dump
--

\restrict cPVTidEaQNh0G9SLZeU0eotZP6dMTTStTG46FqESVOfYrRF9EAKauRIogerdoRa

-- Dumped from database version 17.9 (Ubuntu 17.9-201-yandex.59964.2288f7cd41)
-- Dumped by pg_dump version 17.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', 'public', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: document_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_type_enum AS ENUM (
    'passport',
    'patent_front',
    'patent_back',
    'consent',
    'biometric_consent',
    'other',
    'application_scan',
    'bank_details',
    'kig',
    'diploma',
    'med_book',
    'migration_card',
    'arrival_notice',
    'patent_payment_receipt',
    'mvd_notification',
    'biometric_consent_developer',
    'passport_translation',
    'snils_card',
    'inn_document',
    'memo_approval',
    'employment_history_stdr',
    'registration_amina',
    'insurance_policy',
    'military_id',
    'visa'
);


--
-- Name: TYPE document_type_enum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.document_type_enum IS 'Типы документов: passport, consent, bank_details, kig, patent_front, patent_back';


--
-- Name: employee_status_active; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.employee_status_active AS ENUM (
    'fired',
    'inactive',
    'fired_compl'
);


--
-- Name: employee_status_secure; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.employee_status_secure AS ENUM (
    'allow',
    'block',
    'block_compl'
);


--
-- Name: enum_files_entity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_files_entity_type AS ENUM (
    'employee',
    'pass',
    'other',
    'application'
);


--
-- Name: enum_passes_pass_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_passes_pass_type AS ENUM (
    'temporary',
    'permanent',
    'visitor',
    'contractor'
);


--
-- Name: enum_passes_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_passes_status AS ENUM (
    'active',
    'expired',
    'revoked',
    'pending'
);


--
-- Name: enum_users_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_users_role AS ENUM (
    'admin',
    'user',
    'ot_admin',
    'ot_engineer',
    'laborer',
    'manager'
);


--
-- Name: enum_users_role_old; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_users_role_old AS ENUM (
    'admin',
    'manager',
    'user',
    'ot_admin',
    'ot_engineer',
    'laborer'
);


--
-- Name: ot_comment_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ot_comment_type AS ENUM (
    'contractor',
    'document'
);


--
-- Name: ot_contractor_status_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ot_contractor_status_enum AS ENUM (
    'admitted',
    'not_admitted',
    'temp_admitted',
    'blocked'
);


--
-- Name: ot_document_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.ot_document_status AS ENUM (
    'not_uploaded',
    'uploaded',
    'approved',
    'rejected'
);


--
-- Name: generate_unique_registration_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_unique_registration_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $$

DECLARE

    new_code VARCHAR(8);

    counter INTEGER := 0;

    max_attempts INTEGER := 1000;

BEGIN

    LOOP

        -- Генерация случайного 8-значного номера

        new_code := LPAD(FLOOR(RANDOM() * 100000000)::TEXT, 8, '0');

        

        -- Проверка уникальности

        IF NOT EXISTS (SELECT 1 FROM counterparties WHERE registration_code = new_code) THEN

            RETURN new_code;

        END IF;

        

        counter := counter + 1;

        

        -- Защита от бесконечного цикла

        IF counter >= max_attempts THEN

            RAISE EXCEPTION 'Не удалось сгенерировать уникальный код регистрации после % попыток', max_attempts;

        END IF;

    END LOOP;

END;

$$;


--
-- Name: FUNCTION generate_unique_registration_code(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.generate_unique_registration_code() IS 'Генерация уникального 8-значного кода регистрации для контрагента';


--
-- Name: generate_unique_uin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_unique_uin() RETURNS character varying
    LANGUAGE plpgsql
    AS $$

DECLARE

    new_uin VARCHAR(6);

    counter INTEGER := 0;

    max_attempts INTEGER := 1000;

BEGIN

    LOOP

        -- Генерация случайного 6-значного номера

        new_uin := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');

        

        -- Проверка уникальности

        IF NOT EXISTS (SELECT 1 FROM users WHERE identification_number = new_uin) THEN

            RETURN new_uin;

        END IF;

        

        counter := counter + 1;

        

        -- Защита от бесконечного цикла

        IF counter >= max_attempts THEN

            RAISE EXCEPTION 'Не удалось сгенерировать уникальный УИН после % попыток', max_attempts;

        END IF;

    END LOOP;

END;

$$;


--
-- Name: FUNCTION generate_unique_uin(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.generate_unique_uin() IS 'Генерация уникального 6-значного идентификационного номера (УИН)';


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

BEGIN

  NEW.updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;

END;

$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: application_employees_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_employees_mapping (
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    application_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE application_employees_mapping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.application_employees_mapping IS 'Связь между заявками и сотрудниками (many-to-many mapping)';


--
-- Name: COLUMN application_employees_mapping.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.application_employees_mapping.created_at IS 'Когда сотрудник был добавлен в заявку';


--
-- Name: application_files_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.application_files_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    file_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    application_number character varying(100) NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    counterparty_id uuid NOT NULL,
    construction_site_id uuid,
    subcontract_id uuid,
    created_by uuid NOT NULL,
    updated_by uuid,
    application_type character varying(20) NOT NULL,
    pass_valid_until date,
    CONSTRAINT applications_status_check CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('submitted'::character varying)::text, ('approved'::character varying)::text, ('rejected'::character varying)::text]))),
    CONSTRAINT applications_type_check CHECK (((application_type)::text = ANY (ARRAY[('biometric'::character varying)::text, ('customer'::character varying)::text])))
);


--
-- Name: TABLE applications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.applications IS 'Заявки на пропуска';


--
-- Name: COLUMN applications.application_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applications.application_number IS 'Уникальный номер заявки (генерируется автоматически)';


--
-- Name: COLUMN applications.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applications.status IS 'Статус: draft (черновик), submitted (подана), approved (одобрена), rejected (отклонена)';


--
-- Name: COLUMN applications.construction_site_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applications.construction_site_id IS 'Объект строительства (необязательно)';


--
-- Name: COLUMN applications.pass_valid_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.applications.pass_valid_until IS 'Дата окончания действия пропусков';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id uuid,
    details jsonb,
    ip_address character varying(45),
    user_agent text,
    status character varying(20) DEFAULT 'success'::character varying NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_logs_status_check CHECK (((status)::text = ANY (ARRAY[('success'::character varying)::text, ('failed'::character varying)::text, ('partial'::character varying)::text])))
);


--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_logs IS 'Логи критических действий пользователей для расследования инцидентов безопасности';


--
-- Name: COLUMN audit_logs.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.id IS 'Уникальный идентификатор записи в audit log';


--
-- Name: COLUMN audit_logs.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.user_id IS 'ID пользователя, выполнившего действие';


--
-- Name: COLUMN audit_logs.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.action IS 'Тип действия (EMPLOYEE_IMPORT_START, EMPLOYEE_IMPORT_COMPLETE, и т.д.)';


--
-- Name: COLUMN audit_logs.entity_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.entity_type IS 'Тип сущности (employee, user, application)';


--
-- Name: COLUMN audit_logs.entity_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.entity_id IS 'ID затронутой сущности';


--
-- Name: COLUMN audit_logs.details; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.details IS 'Дополнительная информация о действии (JSON)';


--
-- Name: COLUMN audit_logs.ip_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.ip_address IS 'IP адрес пользователя';


--
-- Name: COLUMN audit_logs.user_agent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.user_agent IS 'User-Agent браузера';


--
-- Name: COLUMN audit_logs.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.status IS 'Статус выполнения действия (success, failed, partial)';


--
-- Name: COLUMN audit_logs.error_message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.error_message IS 'Сообщение об ошибке (если status = failed)';


--
-- Name: COLUMN audit_logs.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_logs.created_at IS 'Дата и время создания записи';


--
-- Name: citizenship_synonyms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.citizenship_synonyms (
    id integer NOT NULL,
    citizenship_id uuid NOT NULL,
    synonym character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE citizenship_synonyms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.citizenship_synonyms IS 'Синонимы гражданств для импорта данных';


--
-- Name: COLUMN citizenship_synonyms.citizenship_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizenship_synonyms.citizenship_id IS 'ID гражданства (UUID)';


--
-- Name: COLUMN citizenship_synonyms.synonym; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizenship_synonyms.synonym IS 'Синоним названия гражданства';


--
-- Name: citizenship_synonyms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.citizenship_synonyms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: citizenship_synonyms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.citizenship_synonyms_id_seq OWNED BY public.citizenship_synonyms.id;


--
-- Name: citizenships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.citizenships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(10),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    requires_patent boolean DEFAULT true NOT NULL,
    is_eaeu boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE citizenships; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.citizenships IS 'Справочник гражданств';


--
-- Name: COLUMN citizenships.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizenships.name IS 'Название гражданства';


--
-- Name: COLUMN citizenships.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizenships.code IS 'Код страны (ISO 3166-1 alpha-2)';


--
-- Name: COLUMN citizenships.requires_patent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizenships.requires_patent IS 'Требуется ли патент для данного гражданства (по умолчанию true)';


--
-- Name: COLUMN citizenships.is_eaeu; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.citizenships.is_eaeu IS 'Относится ли гражданство к странам ЕАЭС (без РФ)';


--
-- Name: construction_sites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.construction_sites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    short_name character varying(100) NOT NULL,
    full_name character varying(500),
    address text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid,
    updated_by uuid,
    code character varying(10)
);


--
-- Name: TABLE construction_sites; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.construction_sites IS 'Объекты строительства';


--
-- Name: COLUMN construction_sites.short_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.construction_sites.short_name IS 'Краткое название объекта';


--
-- Name: COLUMN construction_sites.full_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.construction_sites.full_name IS 'Полное название объекта';


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_number character varying(100) NOT NULL,
    contract_date date NOT NULL,
    type character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    construction_site_id uuid NOT NULL,
    counterparty1_id uuid NOT NULL,
    counterparty2_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT contracts_type_check CHECK (((type)::text = ANY (ARRAY[('subcontract'::character varying)::text, ('general_contract'::character varying)::text])))
);


--
-- Name: TABLE contracts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.contracts IS 'Договоры между контрагентами';


--
-- Name: COLUMN contracts.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.contracts.type IS 'Тип договора: subcontract (договор подряда), general_contract (договор генподряда)';


--
-- Name: counterparties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    inn character varying(12) NOT NULL,
    kpp character varying(9),
    ogrn character varying(15),
    legal_address text,
    phone character varying(20),
    email character varying(255),
    type character varying(50),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by uuid,
    updated_by uuid,
    registration_code character varying(8),
    CONSTRAINT counterparties_type_check CHECK (((type)::text = ANY (ARRAY[('customer'::character varying)::text, ('contractor'::character varying)::text, ('general_contractor'::character varying)::text])))
);


--
-- Name: TABLE counterparties; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.counterparties IS 'Контрагенты: заказчики, подрядчики, владелец';


--
-- Name: COLUMN counterparties.inn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.counterparties.inn IS 'ИНН - 10 или 12 цифр';


--
-- Name: COLUMN counterparties.kpp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.counterparties.kpp IS 'КПП - 9 цифр';


--
-- Name: COLUMN counterparties.ogrn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.counterparties.ogrn IS 'ОГРН - 13 или 15 цифр';


--
-- Name: COLUMN counterparties.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.counterparties.type IS 'DEPRECATED: Используется для обратной совместимости. Новая логика использует counterparties_types_mapping';


--
-- Name: COLUMN counterparties.registration_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.counterparties.registration_code IS 'Уникальный код для регистрации новых пользователей контрагента (8 цифр)';


--
-- Name: counterparties_subcounterparties_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparties_subcounterparties_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_counterparty_id uuid NOT NULL,
    child_counterparty_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_parent_not_child CHECK ((parent_counterparty_id <> child_counterparty_id))
);


--
-- Name: TABLE counterparties_subcounterparties_mapping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.counterparties_subcounterparties_mapping IS 'Таблица связей между контрагентами (родитель создает субподрядчика)';


--
-- Name: COLUMN counterparties_subcounterparties_mapping.parent_counterparty_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.counterparties_subcounterparties_mapping.parent_counterparty_id IS 'ID контрагента-создателя (родитель)';


--
-- Name: COLUMN counterparties_subcounterparties_mapping.child_counterparty_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.counterparties_subcounterparties_mapping.child_counterparty_id IS 'ID субподрядчика (ребенок)';


--
-- Name: COLUMN counterparties_subcounterparties_mapping.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.counterparties_subcounterparties_mapping.created_by IS 'ID пользователя, создавшего связь';


--
-- Name: counterparties_types_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparties_types_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    counterparty_id uuid NOT NULL,
    types jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_types_is_array CHECK ((jsonb_typeof(types) = 'array'::text))
);


--
-- Name: TABLE counterparties_types_mapping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.counterparties_types_mapping IS 'Таблица маппинга типов контрагентов (может быть несколько типов одновременно)';


--
-- Name: COLUMN counterparties_types_mapping.counterparty_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.counterparties_types_mapping.counterparty_id IS 'ID контрагента (уникальный)';


--
-- Name: COLUMN counterparties_types_mapping.types; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.counterparties_types_mapping.types IS 'JSONB массив типов: customer, contractor, general_contractor, subcontractor';


--
-- Name: counterparty_construction_sites_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparty_construction_sites_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    counterparty_id uuid NOT NULL,
    construction_site_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    counterparty_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    construction_site_id uuid
);


--
-- Name: TABLE departments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.departments IS 'Подразделения контрагентов';


--
-- Name: COLUMN departments.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departments.id IS 'Уникальный идентификатор подразделения';


--
-- Name: COLUMN departments.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departments.name IS 'Название подразделения';


--
-- Name: COLUMN departments.counterparty_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departments.counterparty_id IS 'ID контрагента, к которому относится подразделение';


--
-- Name: document_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(64) NOT NULL,
    name text NOT NULL,
    description text,
    sample_url text,
    sample_mime_type character varying(128),
    sample_highlighted_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sample_file_path text,
    sample_original_name text,
    is_required boolean DEFAULT false NOT NULL
);


--
-- Name: employee_counterparty_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_counterparty_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    counterparty_id uuid NOT NULL,
    department_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    construction_site_id uuid,
    dismissed_at timestamp with time zone
);


--
-- Name: TABLE employee_counterparty_mapping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.employee_counterparty_mapping IS 'Связь между сотрудниками, контрагентами и подразделениями';


--
-- Name: COLUMN employee_counterparty_mapping.employee_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employee_counterparty_mapping.employee_id IS 'ID сотрудника';


--
-- Name: COLUMN employee_counterparty_mapping.counterparty_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employee_counterparty_mapping.counterparty_id IS 'ID контрагента';


--
-- Name: COLUMN employee_counterparty_mapping.department_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employee_counterparty_mapping.department_id IS 'ID подразделения (может быть NULL)';


--
-- Name: COLUMN employee_counterparty_mapping.construction_site_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employee_counterparty_mapping.construction_site_id IS 'ID объекта строительства (опционально)';


--
-- Name: COLUMN employee_counterparty_mapping.dismissed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employee_counterparty_mapping.dismissed_at IS 'Последняя актуальная дата увольнения сотрудника у контрагента';


--
-- Name: employee_mobile_auth_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_mobile_auth_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    phone_normalized character varying(32) NOT NULL,
    code_hash character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    delivery_channel character varying(32) DEFAULT 'log'::character varying NOT NULL,
    request_ip character varying(64),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_mobile_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_mobile_sessions (
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
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_ocr_conflicts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_ocr_conflicts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    file_id uuid NOT NULL,
    document_type character varying(64),
    ocr_document_type character varying(64),
    field_name character varying(64) NOT NULL,
    field_label character varying(128) NOT NULL,
    current_value text,
    ocr_value text,
    status character varying(16) DEFAULT 'open'::character varying NOT NULL,
    created_by uuid,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    notification_sent_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_ocr_conflicts_status_check CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'resolved'::character varying])::text[])))
);


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    first_name character varying(255),
    middle_name character varying(255),
    email character varying(255),
    phone character varying(255),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    birth_date date,
    passport_date date,
    passport_issuer text,
    registration_address text,
    patent_issue_date date,
    blank_number character varying(50),
    inn character varying(12),
    snils character varying(14),
    citizenship_id uuid,
    created_by uuid NOT NULL,
    updated_by uuid,
    position_id uuid,
    kig_end_date date,
    passport_type character varying(20),
    passport_expiry_date date,
    gender character varying(10),
    birth_country_id uuid,
    id_all uuid,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    marked_for_deletion boolean DEFAULT false NOT NULL,
    last_name_enc text,
    last_name_hash character varying(64),
    last_name_key_version character varying(16),
    passport_number_enc text,
    passport_number_hash character varying(64),
    passport_number_key_version character varying(16),
    kig_enc text,
    kig_hash character varying(64),
    kig_key_version character varying(16),
    patent_number_enc text,
    patent_number_hash character varying(64),
    patent_number_key_version character varying(16),
    bank_account_number character varying(20),
    insurance_policy_number character varying(64),
    insurance_policy_date date,
    birth_region text,
    birth_city text,
    bank_bik character varying(9),
    passport_department_code character varying(7),
    planned_exit_date date,
    has_residence_permit boolean DEFAULT false NOT NULL,
    CONSTRAINT check_gender_values CHECK (((gender)::text = ANY (ARRAY[('male'::character varying)::text, ('female'::character varying)::text])))
);


--
-- Name: COLUMN employees.first_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.first_name IS 'Имя сотрудника (может быть NULL для черновиков)';


--
-- Name: COLUMN employees.birth_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.birth_date IS 'Дата рождения';


--
-- Name: COLUMN employees.passport_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.passport_date IS 'Дата выдачи паспорта';


--
-- Name: COLUMN employees.passport_issuer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.passport_issuer IS 'Кем выдан паспорт';


--
-- Name: COLUMN employees.registration_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.registration_address IS 'Адрес регистрации';


--
-- Name: COLUMN employees.patent_issue_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.patent_issue_date IS 'Дата выдачи патента';


--
-- Name: COLUMN employees.blank_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.blank_number IS 'Серия и номер бланка документа';


--
-- Name: COLUMN employees.inn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.inn IS 'ИНН сотрудника (10 или 12 цифр)';


--
-- Name: COLUMN employees.snils; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.snils IS 'СНИЛС сотрудника (XXX-XXX-XXX XX)';


--
-- Name: COLUMN employees.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.created_by IS 'ID пользователя, создавшего запись (обязательное поле)';


--
-- Name: COLUMN employees.position_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.position_id IS 'Должность сотрудника (внешний ключ на positions)';


--
-- Name: COLUMN employees.kig_end_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.kig_end_date IS 'Дата окончания действия Карты иностранного гражданина (КИГ)';


--
-- Name: COLUMN employees.passport_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.passport_type IS 'Тип паспорта: russian (Российский) или foreign (Иностранного гражданина)';


--
-- Name: COLUMN employees.passport_expiry_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.passport_expiry_date IS 'Дата окончания действия иностранного паспорта';


--
-- Name: COLUMN employees.last_name_enc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.last_name_enc IS 'Encrypted last name payload (AES-256-GCM envelope)';


--
-- Name: COLUMN employees.last_name_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.last_name_hash IS 'HMAC-SHA-256 of normalized last name for exact search';


--
-- Name: COLUMN employees.last_name_key_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.last_name_key_version IS 'Key version for last_name_enc';


--
-- Name: COLUMN employees.passport_number_enc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.passport_number_enc IS 'Encrypted passport number payload (AES-256-GCM envelope)';


--
-- Name: COLUMN employees.passport_number_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.passport_number_hash IS 'HMAC-SHA-256 of normalized passport number for exact search and uniqueness';


--
-- Name: COLUMN employees.passport_number_key_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.passport_number_key_version IS 'Key version for passport_number_enc';


--
-- Name: COLUMN employees.kig_enc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.kig_enc IS 'Encrypted KIG payload (AES-256-GCM envelope)';


--
-- Name: COLUMN employees.kig_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.kig_hash IS 'HMAC-SHA-256 of normalized KIG for exact search and uniqueness';


--
-- Name: COLUMN employees.kig_key_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.kig_key_version IS 'Key version for kig_enc';


--
-- Name: COLUMN employees.patent_number_enc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.patent_number_enc IS 'Encrypted patent number payload (AES-256-GCM envelope)';


--
-- Name: COLUMN employees.patent_number_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.patent_number_hash IS 'HMAC-SHA-256 of normalized patent number for exact search';


--
-- Name: COLUMN employees.patent_number_key_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.patent_number_key_version IS 'Key version for patent_number_enc';


--
-- Name: COLUMN employees.bank_account_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.bank_account_number IS 'Номер банковского счета сотрудника (20 цифр)';


--
-- Name: COLUMN employees.insurance_policy_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.insurance_policy_number IS 'Номер страхового полиса';


--
-- Name: COLUMN employees.insurance_policy_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.insurance_policy_date IS 'Дата выдачи страхового полиса';


--
-- Name: COLUMN employees.birth_region; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.birth_region IS 'Область / регион рождения';


--
-- Name: COLUMN employees.birth_city; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.birth_city IS 'Населённый пункт рождения';


--
-- Name: COLUMN employees.bank_bik; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.bank_bik IS 'БИК банка (9 цифр)';


--
-- Name: COLUMN employees.passport_department_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.passport_department_code IS 'Код подразделения паспорта РФ в формате 111-222';


--
-- Name: COLUMN employees.planned_exit_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.planned_exit_date IS 'Планируемая дата выхода сотрудника';


--
-- Name: COLUMN employees.has_residence_permit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees.has_residence_permit IS 'Есть вид на жительство (ВНЖ) — патент не требуется';


--
-- Name: employees_statuses_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees_statuses_mapping (
    employee_id uuid NOT NULL,
    status_id integer NOT NULL,
    status_group character varying(50) NOT NULL,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    is_active boolean DEFAULT false,
    is_upload boolean DEFAULT false NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: TABLE employees_statuses_mapping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.employees_statuses_mapping IS 'Маппинг между сотрудниками и их статусами по группам';


--
-- Name: COLUMN employees_statuses_mapping.status_group; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees_statuses_mapping.status_group IS 'Группа статуса для быстрого поиска и индексирования';


--
-- Name: COLUMN employees_statuses_mapping.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees_statuses_mapping.is_active IS 'Только один активный статус для каждой группы сотрудника';


--
-- Name: COLUMN employees_statuses_mapping.is_upload; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.employees_statuses_mapping.is_upload IS 'Флаг для отслеживания загрузки в ЗУП (true - загружено, false - не загружено)';


--
-- Name: excel_column_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.excel_column_sets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    counterparty_id uuid NOT NULL,
    columns jsonb NOT NULL,
    is_default boolean DEFAULT false,
    created_by uuid NOT NULL,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE excel_column_sets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.excel_column_sets IS 'Наборы столбцов для экспорта сотрудников в Excel. Каждый набор принадлежит контрагенту и доступен всем его пользователям.';


--
-- Name: COLUMN excel_column_sets.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.excel_column_sets.name IS 'Название набора столбцов';


--
-- Name: COLUMN excel_column_sets.counterparty_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.excel_column_sets.counterparty_id IS 'ID контрагента-владельца набора';


--
-- Name: COLUMN excel_column_sets.columns; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.excel_column_sets.columns IS 'Массив объектов с информацией о столбцах: ключ, название, активность, порядок';


--
-- Name: COLUMN excel_column_sets.is_default; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.excel_column_sets.is_default IS 'Флаг набора по умолчанию для контрагента';


--
-- Name: COLUMN excel_column_sets.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.excel_column_sets.created_by IS 'ID пользователя, создавшего набор';


--
-- Name: COLUMN excel_column_sets.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.excel_column_sets.updated_by IS 'ID пользователя, последним редактировавшего набор';


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_key character varying(255) NOT NULL,
    file_name character varying(255) NOT NULL,
    original_name character varying(255) NOT NULL,
    mime_type character varying(255) NOT NULL,
    file_size integer NOT NULL,
    file_path character varying(255) NOT NULL,
    public_url character varying(255),
    resource_id character varying(255),
    entity_type enum_files_entity_type,
    is_deleted boolean DEFAULT false,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    entity_id uuid,
    uploaded_by uuid,
    employee_id uuid,
    document_type document_type_enum,
    is_encrypted boolean DEFAULT false NOT NULL,
    encryption_algorithm character varying(32),
    encryption_iv character varying(64),
    encryption_tag character varying(64),
    encryption_key_version character varying(16),
    ocr_verified boolean DEFAULT false NOT NULL,
    ocr_verified_at timestamp with time zone,
    ocr_provider character varying(64),
    ocr_result_json jsonb
);


--
-- Name: COLUMN files.file_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.file_key IS 'Ключ файла на Яндекс.Диске';


--
-- Name: COLUMN files.file_size; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.file_size IS 'Размер файла в байтах';


--
-- Name: COLUMN files.file_path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.file_path IS 'Полный путь на Яндекс.Диске';


--
-- Name: COLUMN files.public_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.public_url IS 'Публичная ссылка на файл';


--
-- Name: COLUMN files.resource_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.resource_id IS 'Resource ID от Яндекс.Диска';


--
-- Name: COLUMN files.entity_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.entity_type IS 'Тип связанной сущности: employee, pass, application, other';


--
-- Name: COLUMN files.document_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.files.document_type IS 'Тип документа: passport (Паспорт), patent_front (Лицевая сторона патента), patent_back (Задняя сторона патента), biometric_consent (Согласие на обработку биометрических данных), application_scan (Скан заявки), other (Другое)';


--
-- Name: ocr_mvd_test_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ocr_mvd_test_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    employee_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    file_name text NOT NULL,
    document_type character varying(64) NOT NULL,
    prompt_used text,
    model_used text,
    ocr_status character varying(32) DEFAULT 'error'::character varying NOT NULL,
    ocr_missing_fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    ocr_normalized jsonb,
    ocr_raw jsonb,
    ocr_error text,
    ocr_provider character varying(64),
    mvd_type character varying(64),
    mvd_status character varying(32),
    mvd_params jsonb,
    mvd_missing_params jsonb DEFAULT '[]'::jsonb NOT NULL,
    mvd_result jsonb,
    mvd_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ot_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    parent_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ot_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type ot_comment_type NOT NULL,
    counterparty_id uuid,
    construction_site_id uuid,
    contractor_document_id uuid,
    text text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ot_contractor_document_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_contractor_document_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contractor_document_id uuid NOT NULL,
    status ot_document_status NOT NULL,
    comment text,
    changed_by uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ot_contractor_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_contractor_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    counterparty_id uuid NOT NULL,
    construction_site_id uuid NOT NULL,
    file_id uuid NOT NULL,
    status ot_document_status DEFAULT 'not_uploaded'::ot_document_status NOT NULL,
    comment text,
    uploaded_by uuid NOT NULL,
    checked_by uuid,
    checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ot_contractor_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_contractor_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    counterparty_id uuid NOT NULL,
    construction_site_id uuid NOT NULL,
    status ot_contractor_status_enum DEFAULT 'not_admitted'::ot_contractor_status_enum NOT NULL,
    is_manual boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ot_contractor_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_contractor_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    counterparty_id uuid NOT NULL,
    construction_site_id uuid NOT NULL,
    status ot_contractor_status_enum NOT NULL,
    changed_by uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ot_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    is_required boolean DEFAULT false NOT NULL,
    template_file_id uuid,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ot_instructions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_instructions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    text text,
    file_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ot_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ot_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    file_id uuid NOT NULL,
    description text,
    is_deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: passes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pass_number character varying(255),
    pass_type enum_passes_pass_type DEFAULT 'temporary'::enum_passes_pass_type NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    access_zones character varying(255)[] DEFAULT (ARRAY[]::character varying[])::character varying(255)[],
    status enum_passes_status DEFAULT 'pending'::enum_passes_status NOT NULL,
    qr_code text,
    document_file_key character varying(255),
    document_file_url character varying(255),
    notes text,
    revoked_at timestamp with time zone,
    revoke_reason text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    employee_id uuid NOT NULL,
    issued_by uuid,
    revoked_by uuid
);


--
-- Name: COLUMN passes.pass_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.passes.pass_number IS 'Уникальный номер пропуска';


--
-- Name: COLUMN passes.access_zones; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.passes.access_zones IS 'Массив зон доступа, например: ["building_a", "floor_1", "office_101"]';


--
-- Name: COLUMN passes.qr_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.passes.qr_code IS 'QR код для сканирования';


--
-- Name: COLUMN passes.document_file_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.passes.document_file_key IS 'Ключ файла документа на Яндекс.Диске';


--
-- Name: COLUMN passes.document_file_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.passes.document_file_url IS 'URL файла документа';


--
-- Name: positions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE positions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.positions IS 'Справочник должностей сотрудников';


--
-- Name: COLUMN positions.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.positions.id IS 'Уникальный идентификатор должности';


--
-- Name: COLUMN positions.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.positions.name IS 'Название должности (уникальное)';


--
-- Name: COLUMN positions.created_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.positions.created_by IS 'Пользователь, создавший запись';


--
-- Name: COLUMN positions.updated_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.positions.updated_by IS 'Пользователь, последним обновивший запись';


--
-- Name: COLUMN positions.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.positions.created_at IS 'Дата и время создания записи';


--
-- Name: COLUMN positions.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.positions.updated_at IS 'Дата и время последнего обновления записи';


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by_token_id uuid,
    created_by_ip character varying(45),
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.settings IS 'Глобальные настройки системы';


--
-- Name: COLUMN settings.key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settings.key IS 'Уникальный ключ настройки';


--
-- Name: COLUMN settings.value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settings.value IS 'Значение настройки (сериализованное)';


--
-- Name: COLUMN settings.description; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.settings.description IS 'Описание настройки';


--
-- Name: skud_access_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skud_access_events (
    id bigint NOT NULL,
    external_system character varying(32) DEFAULT 'sigur'::character varying NOT NULL,
    source character varying(32) DEFAULT 'webdel'::character varying NOT NULL,
    event_type character varying(32) DEFAULT 'passage'::character varying NOT NULL,
    log_id bigint,
    employee_id uuid,
    external_emp_id character varying(128),
    access_point integer,
    direction integer,
    key_hex character varying(128),
    allow boolean,
    decision_message text,
    event_time timestamp with time zone DEFAULT now() NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: skud_access_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.skud_access_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: skud_access_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.skud_access_events_id_seq OWNED BY public.skud_access_events.id;


--
-- Name: skud_access_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skud_access_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    external_system character varying(32) DEFAULT 'sigur'::character varying NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    status_reason text,
    reason_code character varying(64),
    source character varying(32) DEFAULT 'manual'::character varying NOT NULL,
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_to timestamp with time zone,
    changed_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT skud_access_states_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'allowed'::character varying, 'blocked'::character varying, 'revoked'::character varying, 'deleted'::character varying])::text[])))
);


--
-- Name: skud_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skud_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid,
    external_system character varying(32) DEFAULT 'sigur'::character varying NOT NULL,
    external_card_id character varying(128),
    card_number character varying(128) NOT NULL,
    card_number_normalized character varying(128) NOT NULL,
    card_type character varying(32) DEFAULT 'rfid'::character varying NOT NULL,
    status character varying(32) DEFAULT 'active'::character varying NOT NULL,
    issued_at timestamp with time zone,
    blocked_at timestamp with time zone,
    last_seen_at timestamp with time zone,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT skud_cards_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'blocked'::character varying, 'unbound'::character varying, 'revoked'::character varying, 'lost'::character varying])::text[])))
);


--
-- Name: skud_person_bindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skud_person_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    external_system character varying(32) DEFAULT 'sigur'::character varying NOT NULL,
    external_emp_id character varying(128) NOT NULL,
    source character varying(32) DEFAULT 'manual'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: skud_qr_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skud_qr_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    external_system character varying(32) DEFAULT 'sigur'::character varying NOT NULL,
    jti character varying(128) NOT NULL,
    token_hash character varying(128) NOT NULL,
    token_type character varying(32) DEFAULT 'persistent'::character varying NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    issued_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT skud_qr_tokens_type_check CHECK (((token_type)::text = ANY ((ARRAY['persistent'::character varying, 'one_time'::character varying])::text[])))
);


--
-- Name: skud_site_access_points; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skud_site_access_points (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    construction_site_id uuid NOT NULL,
    sigur_access_point_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: skud_sync_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.skud_sync_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_system character varying(32) DEFAULT 'sigur'::character varying NOT NULL,
    employee_id uuid,
    operation character varying(64) NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    response_payload jsonb,
    error_message text,
    attempts integer DEFAULT 0 NOT NULL,
    processed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT skud_sync_jobs_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'processing'::character varying, 'success'::character varying, 'failed'::character varying])::text[])))
);


--
-- Name: statuses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.statuses (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    "group" character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE statuses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.statuses IS 'Справочник всех статусов для сотрудников';


--
-- Name: COLUMN statuses.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.statuses.name IS 'Имя статуса в формате группа_значение (например: status_new, status_card_draft)';


--
-- Name: COLUMN statuses."group"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.statuses."group" IS 'Группа статуса: status, status_card, status_active, status_secure';


--
-- Name: statuses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.statuses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: statuses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.statuses_id_seq OWNED BY public.statuses.id;


--
-- Name: telegram_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    telegram_user_id character varying(32) NOT NULL,
    telegram_chat_id character varying(32) NOT NULL,
    telegram_username character varying(255),
    telegram_first_name character varying(255),
    telegram_last_name character varying(255),
    language character varying(5) DEFAULT 'ru'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    linked_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_command_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_command_logs (
    id bigint NOT NULL,
    employee_id uuid,
    telegram_user_id character varying(32),
    telegram_chat_id character varying(32),
    command character varying(64) NOT NULL,
    status character varying(32) DEFAULT 'received'::character varying NOT NULL,
    request_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    response_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_command_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telegram_command_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_command_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telegram_command_logs_id_seq OWNED BY public.telegram_command_logs.id;


--
-- Name: telegram_link_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_link_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    code character varying(32) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    used_by_telegram_user_id character varying(32),
    created_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_notification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_notification_logs (
    id bigint NOT NULL,
    employee_id uuid NOT NULL,
    event_type character varying(64) NOT NULL,
    event_key character varying(128) NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    delivered_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_notification_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.telegram_notification_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: telegram_notification_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.telegram_notification_logs_id_seq OWNED BY public.telegram_notification_logs.id;


--
-- Name: unauthorized_access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unauthorized_access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    status_code integer NOT NULL,
    method character varying(10) NOT NULL,
    path text NOT NULL,
    ip_address character varying(45),
    user_agent text,
    error_message text,
    details jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_employee_mapping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_employee_mapping (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    counterparty_id uuid
);


--
-- Name: TABLE user_employee_mapping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_employee_mapping IS 'Связь между пользователями системы и сотрудниками';


--
-- Name: COLUMN user_employee_mapping.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_employee_mapping.user_id IS 'ID пользователя';


--
-- Name: COLUMN user_employee_mapping.employee_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_employee_mapping.employee_id IS 'ID сотрудника';


--
-- Name: COLUMN user_employee_mapping.counterparty_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_employee_mapping.counterparty_id IS 'ID контрагента для быстрой фильтрации (NULL для контрагента по умолчанию)';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password character varying(255) NOT NULL,
    first_name character varying(255) NOT NULL,
    last_name character varying(255),
    role enum_users_role_old DEFAULT 'user'::enum_users_role_old NOT NULL,
    is_active boolean DEFAULT true,
    last_login timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    counterparty_id uuid,
    identification_number character varying(6),
    password_changed_at timestamp with time zone,
    user_language character varying(5) DEFAULT 'ru'::character varying NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: COLUMN users.last_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.last_name IS 'Фамилия пользователя (может быть NULL, так как ФИО хранится в first_name)';


--
-- Name: COLUMN users.identification_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.identification_number IS 'Уникальный идентификационный номер (УИН) пользователя в формате xxxxxx (6 цифр)';


--
-- Name: citizenship_synonyms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citizenship_synonyms ALTER COLUMN id SET DEFAULT nextval('citizenship_synonyms_id_seq'::regclass);


--
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('schema_migrations_id_seq'::regclass);


--
-- Name: skud_access_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_access_events ALTER COLUMN id SET DEFAULT nextval('skud_access_events_id_seq'::regclass);


--
-- Name: statuses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.statuses ALTER COLUMN id SET DEFAULT nextval('statuses_id_seq'::regclass);


--
-- Name: telegram_command_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_command_logs ALTER COLUMN id SET DEFAULT nextval('telegram_command_logs_id_seq'::regclass);


--
-- Name: telegram_notification_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_notification_logs ALTER COLUMN id SET DEFAULT nextval('telegram_notification_logs_id_seq'::regclass);


--
-- Name: application_employees_mapping application_employees_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_employees_mapping
    ADD CONSTRAINT application_employees_mapping_pkey PRIMARY KEY (id);


--
-- Name: application_files_mapping application_files_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_files_mapping
    ADD CONSTRAINT application_files_mapping_pkey PRIMARY KEY (id);


--
-- Name: applications applications_application_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_application_number_key UNIQUE (application_number);


--
-- Name: applications applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: citizenship_synonyms citizenship_synonyms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citizenship_synonyms
    ADD CONSTRAINT citizenship_synonyms_pkey PRIMARY KEY (id);


--
-- Name: citizenships citizenships_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citizenships
    ADD CONSTRAINT citizenships_name_key UNIQUE (name);


--
-- Name: citizenships citizenships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citizenships
    ADD CONSTRAINT citizenships_pkey PRIMARY KEY (id);


--
-- Name: construction_sites construction_sites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.construction_sites
    ADD CONSTRAINT construction_sites_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: counterparties counterparties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_pkey PRIMARY KEY (id);


--
-- Name: counterparties counterparties_registration_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_registration_code_key UNIQUE (registration_code);


--
-- Name: counterparties_subcounterparties_mapping counterparties_subcounterparties_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties_subcounterparties_mapping
    ADD CONSTRAINT counterparties_subcounterparties_mapping_pkey PRIMARY KEY (id);


--
-- Name: counterparties_types_mapping counterparties_types_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties_types_mapping
    ADD CONSTRAINT counterparties_types_mapping_pkey PRIMARY KEY (id);


--
-- Name: counterparty_construction_sites_mapping counterparty_construction_sit_counterparty_id_construction__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_construction_sites_mapping
    ADD CONSTRAINT counterparty_construction_sit_counterparty_id_construction__key UNIQUE (counterparty_id, construction_site_id);


--
-- Name: counterparty_construction_sites_mapping counterparty_construction_sites_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_construction_sites_mapping
    ADD CONSTRAINT counterparty_construction_sites_mapping_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: document_types document_types_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_code_key UNIQUE (code);


--
-- Name: document_types document_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_types
    ADD CONSTRAINT document_types_pkey PRIMARY KEY (id);


--
-- Name: employee_counterparty_mapping employee_counterparty_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_counterparty_mapping
    ADD CONSTRAINT employee_counterparty_mapping_pkey PRIMARY KEY (id);


--
-- Name: employee_mobile_auth_codes employee_mobile_auth_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_mobile_auth_codes
    ADD CONSTRAINT employee_mobile_auth_codes_pkey PRIMARY KEY (id);


--
-- Name: employee_mobile_sessions employee_mobile_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_mobile_sessions
    ADD CONSTRAINT employee_mobile_sessions_pkey PRIMARY KEY (id);


--
-- Name: employee_mobile_sessions employee_mobile_sessions_token_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_mobile_sessions
    ADD CONSTRAINT employee_mobile_sessions_token_hash_unique UNIQUE (token_hash);


--
-- Name: employee_ocr_conflicts employee_ocr_conflicts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_ocr_conflicts
    ADD CONSTRAINT employee_ocr_conflicts_pkey PRIMARY KEY (id);


--
-- Name: employee_ocr_conflicts employee_ocr_conflicts_unique_file_field; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_ocr_conflicts
    ADD CONSTRAINT employee_ocr_conflicts_unique_file_field UNIQUE (employee_id, file_id, field_name);


--
-- Name: employees employees_id_all_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_id_all_key UNIQUE (id_all);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employees_statuses_mapping employees_statuses_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees_statuses_mapping
    ADD CONSTRAINT employees_statuses_mapping_pkey PRIMARY KEY (id);


--
-- Name: excel_column_sets excel_column_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excel_column_sets
    ADD CONSTRAINT excel_column_sets_pkey PRIMARY KEY (id);


--
-- Name: files files_file_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_file_key_key UNIQUE (file_key);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: counterparties_types_mapping idx_counterparty_types_mapping_counterparty_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties_types_mapping
    ADD CONSTRAINT idx_counterparty_types_mapping_counterparty_id UNIQUE (counterparty_id);


--
-- Name: ocr_mvd_test_runs ocr_mvd_test_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_mvd_test_runs
    ADD CONSTRAINT ocr_mvd_test_runs_pkey PRIMARY KEY (id);


--
-- Name: ot_categories ot_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_categories
    ADD CONSTRAINT ot_categories_pkey PRIMARY KEY (id);


--
-- Name: ot_comments ot_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_comments
    ADD CONSTRAINT ot_comments_pkey PRIMARY KEY (id);


--
-- Name: ot_contractor_document_history ot_contractor_document_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_document_history
    ADD CONSTRAINT ot_contractor_document_history_pkey PRIMARY KEY (id);


--
-- Name: ot_contractor_documents ot_contractor_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_documents
    ADD CONSTRAINT ot_contractor_documents_pkey PRIMARY KEY (id);


--
-- Name: ot_contractor_status_history ot_contractor_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_status_history
    ADD CONSTRAINT ot_contractor_status_history_pkey PRIMARY KEY (id);


--
-- Name: ot_contractor_status ot_contractor_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_status
    ADD CONSTRAINT ot_contractor_status_pkey PRIMARY KEY (id);


--
-- Name: ot_documents ot_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_documents
    ADD CONSTRAINT ot_documents_pkey PRIMARY KEY (id);


--
-- Name: ot_instructions ot_instructions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_instructions
    ADD CONSTRAINT ot_instructions_pkey PRIMARY KEY (id);


--
-- Name: ot_templates ot_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_templates
    ADD CONSTRAINT ot_templates_pkey PRIMARY KEY (id);


--
-- Name: passes passes_pass_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_pass_number_key UNIQUE (pass_number);


--
-- Name: passes passes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_pkey PRIMARY KEY (id);


--
-- Name: positions positions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_name_key UNIQUE (name);


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_filename_key UNIQUE (filename);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: settings settings_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_key_key UNIQUE (key);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: skud_access_events skud_access_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_access_events
    ADD CONSTRAINT skud_access_events_pkey PRIMARY KEY (id);


--
-- Name: skud_access_states skud_access_states_employee_system_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_access_states
    ADD CONSTRAINT skud_access_states_employee_system_unique UNIQUE (employee_id, external_system);


--
-- Name: skud_access_states skud_access_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_access_states
    ADD CONSTRAINT skud_access_states_pkey PRIMARY KEY (id);


--
-- Name: skud_cards skud_cards_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_cards
    ADD CONSTRAINT skud_cards_number_unique UNIQUE (external_system, card_number_normalized);


--
-- Name: skud_cards skud_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_cards
    ADD CONSTRAINT skud_cards_pkey PRIMARY KEY (id);


--
-- Name: skud_person_bindings skud_person_bindings_employee_system_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_person_bindings
    ADD CONSTRAINT skud_person_bindings_employee_system_unique UNIQUE (employee_id, external_system);


--
-- Name: skud_person_bindings skud_person_bindings_external_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_person_bindings
    ADD CONSTRAINT skud_person_bindings_external_unique UNIQUE (external_system, external_emp_id);


--
-- Name: skud_person_bindings skud_person_bindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_person_bindings
    ADD CONSTRAINT skud_person_bindings_pkey PRIMARY KEY (id);


--
-- Name: skud_qr_tokens skud_qr_tokens_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_qr_tokens
    ADD CONSTRAINT skud_qr_tokens_hash_unique UNIQUE (external_system, token_hash);


--
-- Name: skud_qr_tokens skud_qr_tokens_jti_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_qr_tokens
    ADD CONSTRAINT skud_qr_tokens_jti_unique UNIQUE (external_system, jti);


--
-- Name: skud_qr_tokens skud_qr_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_qr_tokens
    ADD CONSTRAINT skud_qr_tokens_pkey PRIMARY KEY (id);


--
-- Name: skud_site_access_points skud_site_access_points_construction_site_id_sigur_access_p_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_site_access_points
    ADD CONSTRAINT skud_site_access_points_construction_site_id_sigur_access_p_key UNIQUE (construction_site_id, sigur_access_point_id);


--
-- Name: skud_site_access_points skud_site_access_points_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_site_access_points
    ADD CONSTRAINT skud_site_access_points_pkey PRIMARY KEY (id);


--
-- Name: skud_sync_jobs skud_sync_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_sync_jobs
    ADD CONSTRAINT skud_sync_jobs_pkey PRIMARY KEY (id);


--
-- Name: statuses statuses_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.statuses
    ADD CONSTRAINT statuses_name_key UNIQUE (name);


--
-- Name: statuses statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.statuses
    ADD CONSTRAINT statuses_pkey PRIMARY KEY (id);


--
-- Name: telegram_accounts telegram_accounts_employee_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_employee_unique UNIQUE (employee_id);


--
-- Name: telegram_accounts telegram_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_pkey PRIMARY KEY (id);


--
-- Name: telegram_accounts telegram_accounts_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_user_unique UNIQUE (telegram_user_id);


--
-- Name: telegram_command_logs telegram_command_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_command_logs
    ADD CONSTRAINT telegram_command_logs_pkey PRIMARY KEY (id);


--
-- Name: telegram_link_codes telegram_link_codes_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_code_unique UNIQUE (code);


--
-- Name: telegram_link_codes telegram_link_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_pkey PRIMARY KEY (id);


--
-- Name: telegram_notification_logs telegram_notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_notification_logs
    ADD CONSTRAINT telegram_notification_logs_pkey PRIMARY KEY (id);


--
-- Name: telegram_notification_logs telegram_notification_logs_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_notification_logs
    ADD CONSTRAINT telegram_notification_logs_unique UNIQUE (employee_id, event_type, event_key);


--
-- Name: excel_column_sets uk_excel_column_sets_name_counterparty; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excel_column_sets
    ADD CONSTRAINT uk_excel_column_sets_name_counterparty UNIQUE (name, counterparty_id);


--
-- Name: application_files_mapping unique_application_file; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_files_mapping
    ADD CONSTRAINT unique_application_file UNIQUE (application_id, file_id);


--
-- Name: citizenship_synonyms unique_citizenship_synonym; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citizenship_synonyms
    ADD CONSTRAINT unique_citizenship_synonym UNIQUE (citizenship_id, synonym);


--
-- Name: departments unique_department_name_per_counterparty; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT unique_department_name_per_counterparty UNIQUE (name, counterparty_id);


--
-- Name: counterparties_subcounterparties_mapping unique_parent_child_pair; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties_subcounterparties_mapping
    ADD CONSTRAINT unique_parent_child_pair UNIQUE (parent_counterparty_id, child_counterparty_id);


--
-- Name: user_employee_mapping unique_user_employee; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_employee_mapping
    ADD CONSTRAINT unique_user_employee UNIQUE (user_id, employee_id);


--
-- Name: user_employee_mapping user_employee_mapping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_employee_mapping
    ADD CONSTRAINT user_employee_mapping_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_email_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key1 UNIQUE (email);


--
-- Name: users users_email_key2; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key2 UNIQUE (email);


--
-- Name: users users_email_key3; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key3 UNIQUE (email);


--
-- Name: users users_identification_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_identification_number_key UNIQUE (identification_number);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: employees_inn_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_inn_unique ON public.employees USING btree (inn) WHERE ((inn IS NOT NULL) AND ((inn)::text <> ''::text));


--
-- Name: employees_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_is_active ON public.employees USING btree (is_active);


--
-- Name: employees_kig_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_kig_hash_unique ON public.employees USING btree (kig_hash) WHERE ((kig_hash IS NOT NULL) AND ((kig_hash)::text <> ''::text));


--
-- Name: employees_passport_number_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_passport_number_hash_unique ON public.employees USING btree (passport_number_hash) WHERE ((passport_number_hash IS NOT NULL) AND ((passport_number_hash)::text <> ''::text));


--
-- Name: employees_snils_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_snils_unique ON public.employees USING btree (snils) WHERE ((snils IS NOT NULL) AND ((snils)::text <> ''::text));


--
-- Name: employees_statuses_mapping_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX employees_statuses_mapping_active_unique ON public.employees_statuses_mapping USING btree (employee_id, status_group) WHERE (is_active = true);


--
-- Name: employees_statuses_mapping_employee_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_statuses_mapping_employee_id_idx ON public.employees_statuses_mapping USING btree (employee_id);


--
-- Name: employees_statuses_mapping_status_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_statuses_mapping_status_group_idx ON public.employees_statuses_mapping USING btree (status_group);


--
-- Name: employees_statuses_mapping_status_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employees_statuses_mapping_status_id_idx ON public.employees_statuses_mapping USING btree (status_id);


--
-- Name: files_file_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX files_file_key ON public.files USING btree (file_key);


--
-- Name: idx_application_employees_mapping_application_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_application_employees_mapping_application_id ON public.application_employees_mapping USING btree (application_id);


--
-- Name: idx_application_employees_mapping_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_application_employees_mapping_employee_id ON public.application_employees_mapping USING btree (employee_id);


--
-- Name: idx_application_employees_mapping_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_application_employees_mapping_unique ON public.application_employees_mapping USING btree (application_id, employee_id);


--
-- Name: idx_application_files_application; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_application_files_application ON public.application_files_mapping USING btree (application_id);


--
-- Name: idx_application_files_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_application_files_employee ON public.application_files_mapping USING btree (employee_id);


--
-- Name: idx_application_files_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_application_files_file ON public.application_files_mapping USING btree (file_id);


--
-- Name: idx_applications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_created_at ON public.applications USING btree (created_at);


--
-- Name: idx_applications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_status ON public.applications USING btree (status);


--
-- Name: idx_applications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applications_type ON public.applications USING btree (application_type);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id) WHERE (entity_type IS NOT NULL);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_ccm_construction_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ccm_construction_site_id ON public.counterparty_construction_sites_mapping USING btree (construction_site_id);


--
-- Name: idx_ccm_counterparty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ccm_counterparty_id ON public.counterparty_construction_sites_mapping USING btree (counterparty_id);


--
-- Name: idx_citizenship_synonyms_citizenship_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_citizenship_synonyms_citizenship_id ON public.citizenship_synonyms USING btree (citizenship_id);


--
-- Name: idx_citizenship_synonyms_synonym; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_citizenship_synonyms_synonym ON public.citizenship_synonyms USING btree (synonym);


--
-- Name: idx_citizenships_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_citizenships_name ON public.citizenships USING btree (name);


--
-- Name: idx_citizenships_requires_patent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_citizenships_requires_patent ON public.citizenships USING btree (requires_patent);


--
-- Name: idx_construction_sites_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_construction_sites_code ON public.construction_sites USING btree (code);


--
-- Name: idx_construction_sites_short_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_construction_sites_short_name ON public.construction_sites USING btree (short_name);


--
-- Name: idx_contracts_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_number ON public.contracts USING btree (contract_number);


--
-- Name: idx_counterparties_inn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counterparties_inn ON public.counterparties USING btree (inn);


--
-- Name: idx_counterparties_registration_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counterparties_registration_code ON public.counterparties USING btree (registration_code);


--
-- Name: idx_counterparties_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counterparties_type ON public.counterparties USING btree (type);


--
-- Name: idx_counterparties_types_mapping_types; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counterparties_types_mapping_types ON public.counterparties_types_mapping USING gin (types);


--
-- Name: idx_counterparty_construction_mapping_counterparty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counterparty_construction_mapping_counterparty ON public.counterparty_construction_sites_mapping USING btree (counterparty_id);


--
-- Name: idx_counterparty_construction_mapping_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counterparty_construction_mapping_site ON public.counterparty_construction_sites_mapping USING btree (construction_site_id);


--
-- Name: idx_counterparty_subcounterparty_child; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counterparty_subcounterparty_child ON public.counterparties_subcounterparties_mapping USING btree (child_counterparty_id);


--
-- Name: idx_counterparty_subcounterparty_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_counterparty_subcounterparty_parent ON public.counterparties_subcounterparties_mapping USING btree (parent_counterparty_id);


--
-- Name: idx_departments_construction_site_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_construction_site_id ON public.departments USING btree (construction_site_id);


--
-- Name: idx_departments_counterparty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_departments_counterparty_id ON public.departments USING btree (counterparty_id);


--
-- Name: idx_document_types_active_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_types_active_sort ON public.document_types USING btree (is_active, sort_order);


--
-- Name: idx_document_types_sample_file_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_types_sample_file_path ON public.document_types USING btree (sample_file_path);


--
-- Name: idx_ecm_counterparty_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecm_counterparty_employee ON public.employee_counterparty_mapping USING btree (counterparty_id, employee_id);


--
-- Name: idx_ecm_employee_counterparty_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecm_employee_counterparty_site ON public.employee_counterparty_mapping USING btree (employee_id, counterparty_id, construction_site_id);


--
-- Name: idx_emp_cp_mapping_counterparty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emp_cp_mapping_counterparty_id ON public.employee_counterparty_mapping USING btree (counterparty_id);


--
-- Name: idx_emp_cp_mapping_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emp_cp_mapping_department_id ON public.employee_counterparty_mapping USING btree (department_id);


--
-- Name: idx_emp_cp_mapping_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emp_cp_mapping_employee_id ON public.employee_counterparty_mapping USING btree (employee_id);


--
-- Name: idx_employee_counterparty_mapping_dismissed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_counterparty_mapping_dismissed_at ON public.employee_counterparty_mapping USING btree (dismissed_at);


--
-- Name: idx_employee_mobile_auth_codes_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_mobile_auth_codes_employee_id ON public.employee_mobile_auth_codes USING btree (employee_id);


--
-- Name: idx_employee_mobile_auth_codes_phone_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_mobile_auth_codes_phone_expires ON public.employee_mobile_auth_codes USING btree (phone_normalized, expires_at DESC);


--
-- Name: idx_employee_mobile_sessions_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_mobile_sessions_employee_id ON public.employee_mobile_sessions USING btree (employee_id);


--
-- Name: idx_employee_mobile_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_mobile_sessions_expires_at ON public.employee_mobile_sessions USING btree (expires_at DESC);


--
-- Name: idx_employee_mobile_sessions_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_mobile_sessions_phone ON public.employee_mobile_sessions USING btree (phone_normalized);


--
-- Name: idx_employee_ocr_conflicts_employee_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_ocr_conflicts_employee_status ON public.employee_ocr_conflicts USING btree (employee_id, status, created_at DESC);


--
-- Name: idx_employee_ocr_conflicts_file_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_ocr_conflicts_file_id ON public.employee_ocr_conflicts USING btree (file_id);


--
-- Name: idx_employee_ocr_conflicts_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employee_ocr_conflicts_status_created ON public.employee_ocr_conflicts USING btree (status, created_at DESC);


--
-- Name: idx_employees_birth_country_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_birth_country_id ON public.employees USING btree (birth_country_id);


--
-- Name: idx_employees_birth_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_birth_date ON public.employees USING btree (birth_date) WHERE (birth_date IS NOT NULL);


--
-- Name: idx_employees_id_all; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_id_all ON public.employees USING btree (id_all);


--
-- Name: idx_employees_inn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_inn ON public.employees USING btree (inn);


--
-- Name: idx_employees_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_is_deleted ON public.employees USING btree (is_deleted);


--
-- Name: idx_employees_kig_end_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_kig_end_date ON public.employees USING btree (kig_end_date) WHERE (kig_end_date IS NOT NULL);


--
-- Name: idx_employees_kig_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_kig_hash ON public.employees USING btree (kig_hash) WHERE ((kig_hash IS NOT NULL) AND ((kig_hash)::text <> ''::text));


--
-- Name: idx_employees_last_name_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_last_name_hash ON public.employees USING btree (last_name_hash) WHERE ((last_name_hash IS NOT NULL) AND ((last_name_hash)::text <> ''::text));


--
-- Name: idx_employees_marked_for_deletion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_marked_for_deletion ON public.employees USING btree (marked_for_deletion);


--
-- Name: idx_employees_passport_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_passport_date ON public.employees USING btree (passport_date) WHERE (passport_date IS NOT NULL);


--
-- Name: idx_employees_passport_expiry_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_passport_expiry_date ON public.employees USING btree (passport_expiry_date) WHERE (passport_expiry_date IS NOT NULL);


--
-- Name: idx_employees_passport_number_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_passport_number_hash ON public.employees USING btree (passport_number_hash) WHERE ((passport_number_hash IS NOT NULL) AND ((passport_number_hash)::text <> ''::text));


--
-- Name: idx_employees_patent_issue_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_patent_issue_date ON public.employees USING btree (patent_issue_date) WHERE (patent_issue_date IS NOT NULL);


--
-- Name: idx_employees_patent_number_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_patent_number_hash ON public.employees USING btree (patent_number_hash) WHERE ((patent_number_hash IS NOT NULL) AND ((patent_number_hash)::text <> ''::text));


--
-- Name: idx_employees_planned_exit_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_planned_exit_date ON public.employees USING btree (planned_exit_date);


--
-- Name: idx_employees_position_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_position_id ON public.employees USING btree (position_id);


--
-- Name: idx_employees_snils; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_employees_snils ON public.employees USING btree (snils);


--
-- Name: idx_excel_column_sets_counterparty_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_excel_column_sets_counterparty_id ON public.excel_column_sets USING btree (counterparty_id);


--
-- Name: idx_excel_column_sets_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_excel_column_sets_created_by ON public.excel_column_sets USING btree (created_by);


--
-- Name: idx_excel_column_sets_is_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_excel_column_sets_is_default ON public.excel_column_sets USING btree (counterparty_id, is_default) WHERE (is_default = true);


--
-- Name: idx_files_document_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_document_type ON public.files USING btree (document_type);


--
-- Name: idx_files_employee_doc_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_employee_doc_latest ON public.files USING btree (employee_id, entity_type, is_deleted, document_type, created_at DESC) WHERE (employee_id IS NOT NULL);


--
-- Name: idx_files_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_employee_id ON public.files USING btree (employee_id);


--
-- Name: idx_files_is_encrypted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_is_encrypted ON public.files USING btree (is_encrypted);


--
-- Name: idx_files_ocr_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_files_ocr_verified ON public.files USING btree (ocr_verified);


--
-- Name: idx_ocr_mvd_test_runs_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ocr_mvd_test_runs_employee_id ON public.ocr_mvd_test_runs USING btree (employee_id);


--
-- Name: idx_ocr_mvd_test_runs_user_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ocr_mvd_test_runs_user_created_at ON public.ocr_mvd_test_runs USING btree (user_id, created_at DESC);


--
-- Name: idx_ot_categories_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_categories_parent_id ON public.ot_categories USING btree (parent_id);


--
-- Name: idx_ot_comments_counterparty_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_comments_counterparty_site ON public.ot_comments USING btree (counterparty_id, construction_site_id);


--
-- Name: idx_ot_comments_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_comments_type ON public.ot_comments USING btree (type);


--
-- Name: idx_ot_contractor_document_history_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_contractor_document_history_active ON public.ot_contractor_document_history USING btree (is_active);


--
-- Name: idx_ot_contractor_document_history_doc_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_contractor_document_history_doc_id ON public.ot_contractor_document_history USING btree (contractor_document_id);


--
-- Name: idx_ot_contractor_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_contractor_documents_status ON public.ot_contractor_documents USING btree (status);


--
-- Name: idx_ot_contractor_documents_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ot_contractor_documents_unique ON public.ot_contractor_documents USING btree (document_id, counterparty_id, construction_site_id);


--
-- Name: idx_ot_contractor_status_history_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_contractor_status_history_active ON public.ot_contractor_status_history USING btree (is_active);


--
-- Name: idx_ot_contractor_status_history_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_contractor_status_history_pair ON public.ot_contractor_status_history USING btree (counterparty_id, construction_site_id);


--
-- Name: idx_ot_contractor_status_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_contractor_status_status ON public.ot_contractor_status USING btree (status);


--
-- Name: idx_ot_contractor_status_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ot_contractor_status_unique ON public.ot_contractor_status USING btree (counterparty_id, construction_site_id);


--
-- Name: idx_ot_documents_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_documents_category_id ON public.ot_documents USING btree (category_id);


--
-- Name: idx_ot_documents_is_required; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ot_documents_is_required ON public.ot_documents USING btree (is_required);


--
-- Name: idx_positions_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_positions_name ON public.positions USING btree (name);


--
-- Name: idx_refresh_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_expires_at ON public.refresh_tokens USING btree (expires_at);


--
-- Name: idx_refresh_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens USING btree (token_hash);


--
-- Name: idx_refresh_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settings_key ON public.settings USING btree (key);


--
-- Name: idx_skud_access_events_employee_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_access_events_employee_time ON public.skud_access_events USING btree (employee_id, event_time DESC);


--
-- Name: idx_skud_access_events_point_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_access_events_point_time ON public.skud_access_events USING btree (access_point, event_time DESC);


--
-- Name: idx_skud_access_events_system_employee_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_access_events_system_employee_time ON public.skud_access_events USING btree (external_system, employee_id, event_time DESC);


--
-- Name: idx_skud_access_states_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_access_states_status ON public.skud_access_states USING btree (status);


--
-- Name: idx_skud_access_states_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_access_states_updated_at ON public.skud_access_states USING btree (updated_at DESC);


--
-- Name: idx_skud_cards_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_cards_employee_id ON public.skud_cards USING btree (employee_id);


--
-- Name: idx_skud_cards_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_cards_status ON public.skud_cards USING btree (status);


--
-- Name: idx_skud_person_bindings_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_person_bindings_active ON public.skud_person_bindings USING btree (is_active);


--
-- Name: idx_skud_person_bindings_employee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_person_bindings_employee_id ON public.skud_person_bindings USING btree (employee_id);


--
-- Name: idx_skud_qr_tokens_employee_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_qr_tokens_employee_expiry ON public.skud_qr_tokens USING btree (employee_id, expires_at DESC);


--
-- Name: idx_skud_site_access_points_site; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_site_access_points_site ON public.skud_site_access_points USING btree (construction_site_id);


--
-- Name: idx_skud_sync_jobs_employee_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_sync_jobs_employee_created ON public.skud_sync_jobs USING btree (employee_id, created_at DESC);


--
-- Name: idx_skud_sync_jobs_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_skud_sync_jobs_status_created ON public.skud_sync_jobs USING btree (status, created_at DESC);


--
-- Name: idx_telegram_accounts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_accounts_active ON public.telegram_accounts USING btree (is_active);


--
-- Name: idx_telegram_accounts_chat_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_accounts_chat_id ON public.telegram_accounts USING btree (telegram_chat_id);


--
-- Name: idx_telegram_command_logs_command; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_command_logs_command ON public.telegram_command_logs USING btree (command, created_at DESC);


--
-- Name: idx_telegram_command_logs_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_command_logs_user_created ON public.telegram_command_logs USING btree (telegram_user_id, created_at DESC);


--
-- Name: idx_telegram_link_codes_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_link_codes_employee ON public.telegram_link_codes USING btree (employee_id, created_at DESC);


--
-- Name: idx_telegram_link_codes_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_link_codes_expires ON public.telegram_link_codes USING btree (expires_at);


--
-- Name: idx_telegram_notification_logs_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_notification_logs_event ON public.telegram_notification_logs USING btree (event_type, delivered_at DESC);


--
-- Name: idx_unauth_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unauth_logs_created_at ON public.unauthorized_access_logs USING btree (created_at);


--
-- Name: idx_unauth_logs_status_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unauth_logs_status_code ON public.unauthorized_access_logs USING btree (status_code);


--
-- Name: idx_unauth_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unauth_logs_user_id ON public.unauthorized_access_logs USING btree (user_id);


--
-- Name: idx_user_employee_mapping_counterparty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_employee_mapping_counterparty ON public.user_employee_mapping USING btree (counterparty_id);


--
-- Name: idx_user_employee_mapping_employee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_employee_mapping_employee ON public.user_employee_mapping USING btree (employee_id);


--
-- Name: idx_user_employee_mapping_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_employee_mapping_user ON public.user_employee_mapping USING btree (user_id);


--
-- Name: idx_users_identification_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_identification_number ON public.users USING btree (identification_number);


--
-- Name: idx_users_is_deleted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_deleted ON public.users USING btree (is_deleted);


--
-- Name: passes_pass_number; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX passes_pass_number ON public.passes USING btree (pass_number);


--
-- Name: passes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX passes_status ON public.passes USING btree (status);


--
-- Name: passes_valid_from_valid_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX passes_valid_from_valid_until ON public.passes USING btree (valid_from, valid_until);


--
-- Name: unique_employee_counterparty_site_mapping; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_employee_counterparty_site_mapping ON public.employee_counterparty_mapping USING btree (employee_id, counterparty_id, COALESCE(construction_site_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: uq_skud_access_events_external_source_log; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_skud_access_events_external_source_log ON public.skud_access_events USING btree (external_system, source, log_id) WHERE (log_id IS NOT NULL);


--
-- Name: applications update_applications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_applications_updated_at BEFORE UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


--
-- Name: citizenships update_citizenships_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_citizenships_updated_at BEFORE UPDATE ON public.citizenships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


--
-- Name: construction_sites update_construction_sites_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_construction_sites_updated_at BEFORE UPDATE ON public.construction_sites FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


--
-- Name: contracts update_contracts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


--
-- Name: counterparties update_counterparties_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_counterparties_updated_at BEFORE UPDATE ON public.counterparties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


--
-- Name: counterparty_construction_sites_mapping update_counterparty_construction_sites_mapping_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_counterparty_construction_sites_mapping_updated_at BEFORE UPDATE ON public.counterparty_construction_sites_mapping FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


--
-- Name: application_employees_mapping application_employees_mapping_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_employees_mapping
    ADD CONSTRAINT application_employees_mapping_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;


--
-- Name: application_employees_mapping application_employees_mapping_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_employees_mapping
    ADD CONSTRAINT application_employees_mapping_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: application_files_mapping application_files_mapping_application_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_files_mapping
    ADD CONSTRAINT application_files_mapping_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;


--
-- Name: application_files_mapping application_files_mapping_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_files_mapping
    ADD CONSTRAINT application_files_mapping_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: application_files_mapping application_files_mapping_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.application_files_mapping
    ADD CONSTRAINT application_files_mapping_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;


--
-- Name: applications applications_construction_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_construction_site_id_fkey FOREIGN KEY (construction_site_id) REFERENCES construction_sites(id) ON DELETE CASCADE;


--
-- Name: applications applications_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: applications applications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: applications applications_subcontract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_subcontract_id_fkey FOREIGN KEY (subcontract_id) REFERENCES contracts(id) ON DELETE SET NULL;


--
-- Name: applications applications_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.applications
    ADD CONSTRAINT applications_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: construction_sites construction_sites_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.construction_sites
    ADD CONSTRAINT construction_sites_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: construction_sites construction_sites_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.construction_sites
    ADD CONSTRAINT construction_sites_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_construction_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_construction_site_id_fkey FOREIGN KEY (construction_site_id) REFERENCES construction_sites(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_counterparty1_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_counterparty1_id_fkey FOREIGN KEY (counterparty1_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_counterparty2_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_counterparty2_id_fkey FOREIGN KEY (counterparty2_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: contracts contracts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: counterparties counterparties_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: counterparties counterparties_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties
    ADD CONSTRAINT counterparties_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: counterparty_construction_sites_mapping counterparty_construction_sites_mappi_construction_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_construction_sites_mapping
    ADD CONSTRAINT counterparty_construction_sites_mappi_construction_site_id_fkey FOREIGN KEY (construction_site_id) REFERENCES construction_sites(id) ON DELETE CASCADE;


--
-- Name: counterparty_construction_sites_mapping counterparty_construction_sites_mapping_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_construction_sites_mapping
    ADD CONSTRAINT counterparty_construction_sites_mapping_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: employee_mobile_auth_codes employee_mobile_auth_codes_employee_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_mobile_auth_codes
    ADD CONSTRAINT employee_mobile_auth_codes_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: employee_mobile_sessions employee_mobile_sessions_employee_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_mobile_sessions
    ADD CONSTRAINT employee_mobile_sessions_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: employee_ocr_conflicts employee_ocr_conflicts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_ocr_conflicts
    ADD CONSTRAINT employee_ocr_conflicts_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: employee_ocr_conflicts employee_ocr_conflicts_employee_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_ocr_conflicts
    ADD CONSTRAINT employee_ocr_conflicts_employee_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: employee_ocr_conflicts employee_ocr_conflicts_file_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_ocr_conflicts
    ADD CONSTRAINT employee_ocr_conflicts_file_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;


--
-- Name: employee_ocr_conflicts employee_ocr_conflicts_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_ocr_conflicts
    ADD CONSTRAINT employee_ocr_conflicts_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: employees employees_birth_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_birth_country_id_fkey FOREIGN KEY (birth_country_id) REFERENCES citizenships(id) ON DELETE SET NULL;


--
-- Name: employees employees_citizenship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_citizenship_id_fkey FOREIGN KEY (citizenship_id) REFERENCES citizenships(id) ON DELETE SET NULL;


--
-- Name: employees employees_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: employees employees_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_position_id_fkey FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL;


--
-- Name: employees_statuses_mapping employees_statuses_mapping_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees_statuses_mapping
    ADD CONSTRAINT employees_statuses_mapping_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);


--
-- Name: employees_statuses_mapping employees_statuses_mapping_employee_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees_statuses_mapping
    ADD CONSTRAINT employees_statuses_mapping_employee_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: employees_statuses_mapping employees_statuses_mapping_status_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees_statuses_mapping
    ADD CONSTRAINT employees_statuses_mapping_status_fkey FOREIGN KEY (status_id) REFERENCES statuses(id);


--
-- Name: employees_statuses_mapping employees_statuses_mapping_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees_statuses_mapping
    ADD CONSTRAINT employees_statuses_mapping_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);


--
-- Name: employees employees_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: files files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: citizenship_synonyms fk_citizenship_synonym_citizenship; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.citizenship_synonyms
    ADD CONSTRAINT fk_citizenship_synonym_citizenship FOREIGN KEY (citizenship_id) REFERENCES citizenships(id) ON DELETE CASCADE;


--
-- Name: counterparties_subcounterparties_mapping fk_counterparty_subcounterparty_child; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties_subcounterparties_mapping
    ADD CONSTRAINT fk_counterparty_subcounterparty_child FOREIGN KEY (child_counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: counterparties_subcounterparties_mapping fk_counterparty_subcounterparty_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties_subcounterparties_mapping
    ADD CONSTRAINT fk_counterparty_subcounterparty_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: counterparties_subcounterparties_mapping fk_counterparty_subcounterparty_parent; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties_subcounterparties_mapping
    ADD CONSTRAINT fk_counterparty_subcounterparty_parent FOREIGN KEY (parent_counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: counterparties_types_mapping fk_counterparty_types_mapping_counterparty; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparties_types_mapping
    ADD CONSTRAINT fk_counterparty_types_mapping_counterparty FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: departments fk_department_counterparty; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT fk_department_counterparty FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: departments fk_departments_construction_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT fk_departments_construction_site FOREIGN KEY (construction_site_id) REFERENCES construction_sites(id) ON DELETE SET NULL;


--
-- Name: employee_counterparty_mapping fk_ecm_construction_site; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_counterparty_mapping
    ADD CONSTRAINT fk_ecm_construction_site FOREIGN KEY (construction_site_id) REFERENCES construction_sites(id) ON DELETE SET NULL;


--
-- Name: excel_column_sets fk_excel_column_sets_counterparty; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excel_column_sets
    ADD CONSTRAINT fk_excel_column_sets_counterparty FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: excel_column_sets fk_excel_column_sets_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excel_column_sets
    ADD CONSTRAINT fk_excel_column_sets_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: excel_column_sets fk_excel_column_sets_updated_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excel_column_sets
    ADD CONSTRAINT fk_excel_column_sets_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: files fk_files_employee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT fk_files_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: employee_counterparty_mapping fk_mapping_counterparty; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_counterparty_mapping
    ADD CONSTRAINT fk_mapping_counterparty FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: employee_counterparty_mapping fk_mapping_department; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_counterparty_mapping
    ADD CONSTRAINT fk_mapping_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;


--
-- Name: employee_counterparty_mapping fk_mapping_employee; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_counterparty_mapping
    ADD CONSTRAINT fk_mapping_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: user_employee_mapping fk_user_employee_mapping_counterparty; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_employee_mapping
    ADD CONSTRAINT fk_user_employee_mapping_counterparty FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE SET NULL;


--
-- Name: ocr_mvd_test_runs ocr_mvd_test_runs_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_mvd_test_runs
    ADD CONSTRAINT ocr_mvd_test_runs_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;


--
-- Name: ocr_mvd_test_runs ocr_mvd_test_runs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ocr_mvd_test_runs
    ADD CONSTRAINT ocr_mvd_test_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: ot_categories ot_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_categories
    ADD CONSTRAINT ot_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES ot_categories(id) ON DELETE SET NULL;


--
-- Name: ot_comments ot_comments_construction_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_comments
    ADD CONSTRAINT ot_comments_construction_site_id_fkey FOREIGN KEY (construction_site_id) REFERENCES construction_sites(id) ON DELETE SET NULL;


--
-- Name: ot_comments ot_comments_contractor_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_comments
    ADD CONSTRAINT ot_comments_contractor_document_id_fkey FOREIGN KEY (contractor_document_id) REFERENCES ot_contractor_documents(id) ON DELETE SET NULL;


--
-- Name: ot_comments ot_comments_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_comments
    ADD CONSTRAINT ot_comments_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE SET NULL;


--
-- Name: ot_comments ot_comments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_comments
    ADD CONSTRAINT ot_comments_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;


--
-- Name: ot_contractor_document_history ot_contractor_document_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_document_history
    ADD CONSTRAINT ot_contractor_document_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT;


--
-- Name: ot_contractor_document_history ot_contractor_document_history_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_document_history
    ADD CONSTRAINT ot_contractor_document_history_document_id_fkey FOREIGN KEY (contractor_document_id) REFERENCES ot_contractor_documents(id) ON DELETE CASCADE;


--
-- Name: ot_contractor_documents ot_contractor_documents_checked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_documents
    ADD CONSTRAINT ot_contractor_documents_checked_by_fkey FOREIGN KEY (checked_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: ot_contractor_documents ot_contractor_documents_construction_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_documents
    ADD CONSTRAINT ot_contractor_documents_construction_site_id_fkey FOREIGN KEY (construction_site_id) REFERENCES construction_sites(id) ON DELETE CASCADE;


--
-- Name: ot_contractor_documents ot_contractor_documents_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_documents
    ADD CONSTRAINT ot_contractor_documents_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: ot_contractor_documents ot_contractor_documents_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_documents
    ADD CONSTRAINT ot_contractor_documents_document_id_fkey FOREIGN KEY (document_id) REFERENCES ot_documents(id) ON DELETE CASCADE;


--
-- Name: ot_contractor_documents ot_contractor_documents_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_documents
    ADD CONSTRAINT ot_contractor_documents_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT;


--
-- Name: ot_contractor_documents ot_contractor_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_documents
    ADD CONSTRAINT ot_contractor_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT;


--
-- Name: ot_contractor_status ot_contractor_status_construction_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_status
    ADD CONSTRAINT ot_contractor_status_construction_site_id_fkey FOREIGN KEY (construction_site_id) REFERENCES construction_sites(id) ON DELETE CASCADE;


--
-- Name: ot_contractor_status ot_contractor_status_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_status
    ADD CONSTRAINT ot_contractor_status_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: ot_contractor_status_history ot_contractor_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_status_history
    ADD CONSTRAINT ot_contractor_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT;


--
-- Name: ot_contractor_status_history ot_contractor_status_history_construction_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_status_history
    ADD CONSTRAINT ot_contractor_status_history_construction_site_id_fkey FOREIGN KEY (construction_site_id) REFERENCES construction_sites(id) ON DELETE CASCADE;


--
-- Name: ot_contractor_status_history ot_contractor_status_history_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_contractor_status_history
    ADD CONSTRAINT ot_contractor_status_history_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;


--
-- Name: ot_documents ot_documents_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_documents
    ADD CONSTRAINT ot_documents_category_id_fkey FOREIGN KEY (category_id) REFERENCES ot_categories(id) ON DELETE RESTRICT;


--
-- Name: ot_documents ot_documents_template_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_documents
    ADD CONSTRAINT ot_documents_template_file_id_fkey FOREIGN KEY (template_file_id) REFERENCES files(id) ON DELETE SET NULL;


--
-- Name: ot_instructions ot_instructions_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_instructions
    ADD CONSTRAINT ot_instructions_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL;


--
-- Name: ot_templates ot_templates_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ot_templates
    ADD CONSTRAINT ot_templates_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT;


--
-- Name: passes passes_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: passes passes_issued_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: passes passes_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: positions positions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: positions positions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: skud_access_events skud_access_events_employee_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_access_events
    ADD CONSTRAINT skud_access_events_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;


--
-- Name: skud_access_states skud_access_states_changed_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_access_states
    ADD CONSTRAINT skud_access_states_changed_by_fk FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: skud_access_states skud_access_states_employee_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_access_states
    ADD CONSTRAINT skud_access_states_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: skud_cards skud_cards_created_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_cards
    ADD CONSTRAINT skud_cards_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: skud_cards skud_cards_employee_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_cards
    ADD CONSTRAINT skud_cards_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;


--
-- Name: skud_cards skud_cards_updated_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_cards
    ADD CONSTRAINT skud_cards_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: skud_person_bindings skud_person_bindings_created_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_person_bindings
    ADD CONSTRAINT skud_person_bindings_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: skud_person_bindings skud_person_bindings_employee_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_person_bindings
    ADD CONSTRAINT skud_person_bindings_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: skud_person_bindings skud_person_bindings_updated_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_person_bindings
    ADD CONSTRAINT skud_person_bindings_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: skud_qr_tokens skud_qr_tokens_employee_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_qr_tokens
    ADD CONSTRAINT skud_qr_tokens_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: skud_qr_tokens skud_qr_tokens_issued_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_qr_tokens
    ADD CONSTRAINT skud_qr_tokens_issued_by_fk FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: skud_site_access_points skud_site_access_points_construction_site_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_site_access_points
    ADD CONSTRAINT skud_site_access_points_construction_site_id_fkey FOREIGN KEY (construction_site_id) REFERENCES construction_sites(id) ON DELETE CASCADE;


--
-- Name: skud_sync_jobs skud_sync_jobs_created_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_sync_jobs
    ADD CONSTRAINT skud_sync_jobs_created_by_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: skud_sync_jobs skud_sync_jobs_employee_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.skud_sync_jobs
    ADD CONSTRAINT skud_sync_jobs_employee_fk FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;


--
-- Name: telegram_accounts telegram_accounts_employee_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_accounts
    ADD CONSTRAINT telegram_accounts_employee_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: telegram_command_logs telegram_command_logs_employee_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_command_logs
    ADD CONSTRAINT telegram_command_logs_employee_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;


--
-- Name: telegram_link_codes telegram_link_codes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;


--
-- Name: telegram_link_codes telegram_link_codes_employee_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_employee_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: telegram_notification_logs telegram_notification_logs_employee_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_notification_logs
    ADD CONSTRAINT telegram_notification_logs_employee_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: user_employee_mapping user_employee_mapping_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_employee_mapping
    ADD CONSTRAINT user_employee_mapping_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;


--
-- Name: user_employee_mapping user_employee_mapping_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_employee_mapping
    ADD CONSTRAINT user_employee_mapping_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;


--
-- Name: users users_counterparty_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_counterparty_id_fkey FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict cPVTidEaQNh0G9SLZeU0eotZP6dMTTStTG46FqESVOfYrRF9EAKauRIogerdoRa

