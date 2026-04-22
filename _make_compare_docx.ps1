$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

$outPath = 'C:\Users\Usr\vscodeprojects\PassDesk\compare.docx'

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0  # wdAlertsNone

try {
    $doc = $word.Documents.Add()
    $sel = $word.Selection

    function Add-Style($style, $text) {
        $sel.Style = $style
        $sel.TypeText($text)
        $sel.TypeParagraph()
    }
    function Add-Title($text)    { Add-Style 'Title'      $text }
    function Add-H1($text)       { Add-Style 'Heading 1'  $text }
    function Add-H2($text)       { Add-Style 'Heading 2'  $text }
    function Add-H3($text)       { Add-Style 'Heading 3'  $text }
    function Add-Para($text)     { Add-Style 'Normal'     $text }
    function Add-Bullet($text)   { Add-Style 'List Bullet' $text }

    # ============ TITLE & INTRO ============
    Add-Title 'Два варианта оптимальной архитектуры аутентификации'

    Add-Para 'Документ описывает две целевые архитектуры аутентификации для портала PassDesk: (A) на базе Supabase Auth как managed-BaaS и (B) на собственном сервере с Yandex Managed PostgreSQL. Обе архитектуры спроектированы с учётом одинакового набора угроз: XSS-кража токена, CSRF, brute-force логина, подмена пути и open-redirect, утечка паролей, компрометация refresh-токена, enumeration пользователей, отсутствие аудита. Цель — два «эталона», из которых можно выбирать по операционным соображениям.'

    # ============ ВАРИАНТ A ============
    Add-H1 'Вариант A — Supabase Auth (managed)'

    Add-H2 'A.1 Топология'
    Add-Para 'Клиент (React SPA) ↔ собственный BFF (Fastify/Express) ↔ supabase.com (Auth GoTrue + Postgres+RLS). Перед Nginx — TLS-терминация, HSTS, CSP. Ключ: SDK Supabase в браузере для auth НЕ используется. На клиенте нет токенов в localStorage, нет прямого anon_key с правом auth-операций.'

    Add-H2 'A.2 Аутентификация'
    Add-Bullet 'Endpoint BFF POST /api/auth/login → внутри вызов supabase.auth.signInWithPassword({email,password}).'
    Add-Bullet 'Ответ Supabase (access, refresh) не возвращается в тело — BFF кладёт токены в HttpOnly cookies.'
    Add-Bullet '__Host-access: HttpOnly; Secure; SameSite=Strict; Path=/; TTL ≈ 15 минут.'
    Add-Bullet '__Host-refresh: HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh; TTL 7 дней.'
    Add-Bullet 'Префикс __Host- запрещает браузеру принять cookie без Secure, без Path=/ (для access) и с атрибутом Domain — защита от cookie-tossing в поддоменах.'
    Add-Bullet 'POST /api/auth/logout — реальный revoke: BFF вызывает supabaseAdmin.auth.admin.signOut(userId, scope=''global'') service_role-ключом, затем стирает cookies.'

    Add-H2 'A.3 Пароли'
    Add-Bullet 'Хранение и хэширование — на стороне Supabase (bcrypt, managed, без возможности сменить алгоритм).'
    Add-Bullet 'В Supabase dashboard: Leaked Password Protection (HIBP) = on; minimum length = 12.'
    Add-Bullet 'BFF дополнительно: классы символов ≥3 из 4 (upper/lower/digit/symbol), zxcvbn score ≥3, запрет совпадения с email/ФИО/названием компании.'
    Add-Bullet 'Unified error-message: «неверный email или пароль» — без различия «пользователь не найден»/«пароль неверный», чтобы исключить enumeration.'

    Add-H2 'A.4 MFA / 2FA'
    Add-Bullet 'Включить в Supabase: Auth → MFA → TOTP.'
    Add-Bullet 'BFF-endpoints: /api/auth/mfa/enroll, /api/auth/mfa/challenge, /api/auth/mfa/verify.'
    Add-Bullet 'Admin-endpoints доступны только при claim aal = aal2 (проверка в middleware requireAal).'
    Add-Bullet 'Резервные одноразовые коды: 10 штук, bcrypt-хэш в таблице mfa_backup_codes.'

    Add-H2 'A.5 Защита от brute-force'
    Add-Bullet 'Адресный @fastify/rate-limit на /api/auth/login: 5 попыток / 15 минут / IP + 10 попыток / час / email; skipOnSuccess: true.'
    Add-Bullet 'После 3 неудач — CAPTCHA (Cloudflare Turnstile или hCaptcha).'
    Add-Bullet 'После 10 неудач на email — блокировка аккаунта на 30 минут + email-уведомление пользователю.'
    Add-Bullet 'На стороне Supabase: Auth Rate Limits в dashboard (email, OTP); leaked-password protection включён.'

    Add-H2 'A.6 Верификация JWT'
    Add-Para 'Никакого симметричного секрета на BFF. Верификация через JWKS:'
    Add-Style 'Intense Quote' '  const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));   const { payload } = await jwtVerify(token, JWKS, { issuer: `${SUPABASE_URL}/auth/v1`, audience: ''authenticated'' });'
    Add-Para 'Явная проверка exp, nbf, iss, aud — не доверять дефолтам SDK.'

    Add-H2 'A.7 Авторизация и RLS (обязательно)'
    Add-Bullet 'Каждая таблица: ALTER TABLE ... ENABLE ROW LEVEL SECURITY; + FORCE ROW LEVEL SECURITY;'
    Add-Bullet 'Политики на auth.uid() и кастомные claims role/counterparty_id, добавляемые через Postgres-функцию custom_access_token_hook (plpgsql).'
    Add-Bullet 'anon_key на клиенте НЕ используется; BFF ходит в БД от имени пользователя с его JWT (PostgREST / supabase.from с Authorization) — RLS принуждается БД.'
    Add-Bullet 'Admin-операции — только через service_role в BFF, никогда в браузере.'

    Add-H2 'A.8 CSRF / open-redirect / path-traversal'
    Add-Bullet 'Cookies SameSite=Strict — базовая CSRF-защита.'
    Add-Bullet 'Double-submit CSRF-token: cookie csrf-token + заголовок X-CSRF-Token на всех state-changing endpoints BFF.'
    Add-Bullet 'returnUrl: startsWith(''/''), не ''//'', не содержит ''://'', длина ≤ 256.'
    Add-Bullet 'Имена файлов: санитайзер (транслит кириллицы, замена спецсимволов на _); storage-ключи строятся из whitelisted enum-контекстов, никогда из пользовательского ввода напрямую.'

    Add-H2 'A.9 Transport и заголовки'
    Add-Bullet 'Nginx: listen 80; return 301 https://$host$request_uri; — обязательный редирект.'
    Add-Bullet 'HSTS: max-age=63072000; includeSubDomains; preload.'
    Add-Bullet 'CSP: default-src ''self''; script-src ''self'' ''nonce-XYZ''; style-src ''self''; connect-src ''self'' https://<project>.supabase.co; frame-ancestors ''none''.'
    Add-Bullet 'Referrer-Policy: strict-origin-when-cross-origin; X-Content-Type-Options: nosniff; X-Frame-Options: DENY; Permissions-Policy: camera=(), microphone=(), geolocation=().'
    Add-Bullet 'CORS: конкретный origin (не *), credentials: true.'

    Add-H2 'A.10 Аудит и observability'
    Add-Bullet 'Таблица auth_events в БД: login_success/failure, refresh, logout, mfa_enroll/verify, password_change. Поля: user_id, email_hash, ip, user_agent, event, ts.'
    Add-Bullet 'Supabase dashboard → Auth → Logs (встроено).'
    Add-Bullet 'Redaction в логах pino/fastify: authorization, cookie, body.password, body.newPassword, body.currentPassword.'
    Add-Bullet 'SIEM-алерты на всплески 401/403 и >N неуспешных логинов за единицу времени.'

    Add-H2 'A.11 Секреты'
    Add-Bullet 'SUPABASE_SERVICE_ROLE_KEY — только в BFF, никогда в клиенте. Хранение: секрет-менеджер (Yandex Lockbox / HashiCorp Vault).'
    Add-Bullet 'SUPABASE_ANON_KEY на клиенте не требуется (весь трафик идёт через BFF); если используется — только для публичных таблиц под строгой RLS.'
    Add-Bullet '.env в .gitignore; на старте BFF проверяет обязательность переменных и их минимальные длины.'

    # ============ ВАРИАНТ B ============
    Add-H1 'Вариант B — Собственный сервер на Yandex Managed PostgreSQL'

    Add-H2 'B.1 Топология'
    Add-Para 'Клиент (React SPA) ↔ Nginx (TLS-термин., HSTS, CSP, rate-limit) ↔ Auth API (Node.js / Express) ↔ Yandex Managed PostgreSQL (таблицы users, refresh_tokens, auth_events, mfa_*). Секреты — Yandex Lockbox; KMS — для шифрования TOTP-секретов (envelope encryption); опционально — для server-pepper паролей.'

    Add-H2 'B.2 Аутентификация'
    Add-Bullet 'Endpoint POST /api/v1/auth/login; валидация через zod/express-validator.'
    Add-Bullet 'Unified error на любую ошибку: «неверный email или пароль» — анти-enumeration.'
    Add-Bullet 'Unified latency: если пользователь не найден, всё равно выполнить «холостой» verify на дамми-хэше той же стоимости — время ответа не раскрывает существование пользователя.'
    Add-Bullet 'Экспоненциальный backoff по ключу email в Redis: 1с → 2с → 4с → … до 30с.'

    Add-H2 'B.3 Пароли'
    Add-Para 'Базовый минимум (прагматично, совместимо с миграцией из PassDesk):'
    Add-Bullet 'bcrypt, cost = 12.'
    Add-Bullet 'Проверка HIBP k-anonymity API (префикс SHA-1 из 5 символов): на compromised = reject.'
    Add-Bullet 'zxcvbn score ≥ 3; длина ≥ 12; классы ≥ 3 из 4; запрет совпадения с email/ФИО/названием компании.'
    Add-Bullet 'password_changed_at в users инвалидирует все активные access+refresh токены (см. B.5).'
    Add-Para 'Опциональный апгрейд (под повышенные требования):'
    Add-Bullet 'Argon2id с параметрами m = 19 MiB (19456 KiB), t = 2, p = 1 — OWASP 2023 baseline, устойчивое к DDoS на регистрации. 64 MiB не используем: не банковское приложение, массовые signup-атаки исчерпают память.'
    Add-Bullet 'Server-pepper 256 бит в Yandex KMS; хэшируем Argon2id(password || pepper). Ротация по версии: поле password_hash_version в users для сосуществования версий и ленивой миграции при следующем успешном логине пользователя.'

    Add-H2 'B.4 Access-токен'
    Add-Bullet 'JWT EdDSA (Ed25519) — современный алгоритм, небольшой размер. Публичный ключ раздаётся микросервисам, приватный — только в auth-сервисе. Альтернатива: HS512 (одно приложение, симметричный секрет в Lockbox).'
    Add-Bullet 'TTL = 15 минут.'
    Add-Bullet 'Payload: sub, role, counterparty_id, aal, sid (session_id), iat, exp, iss, aud.'
    Add-Bullet 'Хранение на клиенте: только в памяти (React state / closure). Никакого localStorage / sessionStorage.'
    Add-Bullet 'Передача: заголовок Authorization: Bearer ...'
    Add-Bullet 'Проверка на каждый запрос: подпись + exp + sessionsInvalidatedAt пользователя (LRU-кэш 15 секунд).'

    Add-H2 'B.5 Refresh-токен'
    Add-Bullet 'Opaque (не JWT): CSPRNG 256 бит, base64url.'
    Add-Bullet 'В cookie: __Host-refresh; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth.'
    Add-Bullet 'В БД — только SHA-256 хэш, вместе с session_id, issued_at, expires_at, revoked_at, replaced_by, ip, user_agent.'
    Add-Bullet 'Rolling rotation: каждый успешный /refresh возвращает новый токен и помечает старый revoked_at = now(), replaced_by = new.id.'
    Add-Bullet 'Reuse detection: если пришёл уже revoked токен — revoke всей цепочки (вся session_id) + алерт. Это реальный индикатор угона.'
    Add-Bullet 'User-Agent и IP при каждом refresh ЛОГИРУЮТСЯ в sessions.last_seen_ua/ip, но НЕ используются как триггер автоматического revoke (мобильный CGNAT, VPN, смена Wi-Fi, обновление браузера — ложные срабатывания; пользователи привыкают игнорить алерты, защита перестаёт работать).'
    Add-Bullet 'Endpoint GET /api/v1/me/sessions — список активных сессий (UA, IP, GeoIP-город, last_seen, текущая highlighted).'
    Add-Bullet 'Endpoint DELETE /api/v1/me/sessions/:id — ручной revoke пользователем (модель GitHub / Google).'
    Add-Bullet 'Email-уведомление — только на новый login (первое появление session_id), не на каждый refresh.'
    Add-Bullet 'TTL 14 дней rolling (сдвигается при каждом refresh). Абсолютный максимум absolute_max = 90 дней от issued_at первого токена цепочки.'
    Add-Bullet 'POST /logout: revoke текущего refresh и пометка sessions.invalidated_at = now() → access-JWT отклоняется middleware до своего TTL.'
    Add-Bullet 'POST /logout-all: revoke всех refresh пользователя.'

    Add-H2 'B.6 MFA / 2FA'
    Add-Bullet 'TOTP (RFC 6238), 30s step, 6 цифр. Секреты в БД, зашифрованы KMS-ключом (envelope encryption).'
    Add-Bullet 'Обязательно для ролей admin, ot_admin. Опционально для остальных.'
    Add-Bullet 'Claim aal в JWT: aal1 — только пароль, aal2 — пароль + TOTP. Middleware requireAal(''aal2'') для critical endpoints.'
    Add-Bullet '10 резервных кодов (bcrypt-хэш), одноразовые.'

    Add-H2 'B.7 Защита от brute-force'
    Add-Bullet 'Rate-limits (express-rate-limit + Redis): /auth/login — 5 / 15 мин / IP; 10 / час / email. /auth/refresh — 60 / мин / IP. /auth/register — 3 / час / IP.'
    Add-Bullet 'Остальные write — 100 / мин; read — 1000 / мин.'
    Add-Bullet 'CAPTCHA (Turnstile / hCaptcha) — после 3 неудачных попыток по IP/email.'
    Add-Bullet 'Блокировка аккаунта на 30 минут после 10 неудач + email-уведомление.'
    Add-Bullet 'Fail2ban-паттерн на уровне Nginx: бан IP при > N HTTP 401 за минуту.'

    Add-H2 'B.8 RBAC и RLS (обязательно)'
    Add-Bullet 'Роли приложения: admin, user, laborer, manager, ot_engineer, ot_admin. Проверка в middleware authorize(...roles) — первая линия.'
    Add-Bullet 'Postgres RLS — вторая линия (defense-in-depth): отдельная БД-роль app_authenticated без BYPASSRLS.'
    Add-Bullet 'Каждая транзакция начинается с SET LOCAL app.user_id / app.user_role / app.counterparty_id = ... из JWT payload.'
    Add-Bullet 'Политика: alter table X enable/force row level security; create policy ... using (current_setting(''app.user_role'',true) = ''admin'' or counterparty_id = current_setting(''app.counterparty_id'',true)::uuid).'
    Add-Bullet 'Миграционный процесс: сначала политики, затем переключение коннекшен-пула на роль app_authenticated.'

    Add-H2 'B.9 CSRF / open-redirect / path-traversal'
    Add-Bullet 'SameSite=Strict на refresh-cookie.'
    Add-Bullet 'Access — в заголовке Authorization (не отправляется браузером автоматически) → CSRF неактуален для этого пути.'
    Add-Bullet 'Double-submit CSRF-token на state-changing endpoints, использующих cookies.'
    Add-Bullet 'returnUrl валидируется: startsWith(''/''), не ''//'', не содержит ''://'', длина ≤ 256.'
    Add-Bullet 'Пути к файлам/ресурсам — из whitelist enum; имена — через санитайзер.'

    Add-H2 'B.10 Transport и заголовки'
    Add-Bullet 'Nginx терминирует TLS (Let''s Encrypt / Yandex Certificate Manager). Редирект 80 → 443 обязателен.'
    Add-Bullet 'HSTS: max-age=63072000; includeSubDomains; preload.'
    Add-Bullet 'CSP: default-src ''self''; script-src ''self'' ''nonce-XYZ''; style-src ''self'' ''nonce-XYZ''; connect-src ''self''; frame-ancestors ''none''; base-uri ''self''; form-action ''self''.'
    Add-Bullet 'Referrer-Policy: strict-origin-when-cross-origin; X-Content-Type-Options: nosniff; X-Frame-Options: DENY; Permissions-Policy — минимум.'
    Add-Bullet 'helmet() на Express плюс Nginx-заголовки — двойная линия.'

    Add-H2 'B.11 Аудит и observability'
    Add-Bullet 'Таблица auth_events: user_id, email_hash, ip, user_agent, event, ts, meta jsonb. События: login_success, login_failure, refresh_success, refresh_reuse_detected, logout, logout_all, password_change, mfa_enroll, mfa_verify_success/failure, account_locked, password_reset_*.'
    Add-Bullet 'Таблица unauthorized_access_log (401/403) — существует в PassDesk, расширить до описанной схемы.'
    Add-Bullet 'Логи в JSON (pino), redaction: password, currentPassword, newPassword, authorization, cookie, token, refreshToken.'
    Add-Bullet 'Экспорт в Yandex Cloud Logging / SIEM. Алерты: refresh_reuse_detected (S1), всплески login_failure (S2).'

    Add-H2 'B.12 Секреты и инфраструктура'
    Add-Bullet 'Yandex Lockbox — хранение секретов (DB URL, JWT signing key, SMTP, Turnstile secret).'
    Add-Bullet 'Yandex KMS — ключи для шифрования TOTP-секретов (envelope encryption); опционально — pepper-ключ для паролей.'
    Add-Bullet 'Yandex Managed PostgreSQL: TLS в коннекшен-строке обязательно (sslmode=verify-full + CA); ограничение по security groups (только из private subnet backend-а).'
    Add-Bullet 'Бэкапы БД с шифрованием, PITR включено.'
    Add-Bullet '.env в .gitignore. На старте сервис проверяет: JWT signing key присутствует и валиден; pepper-ключ (если используется) достаётся из KMS; TLS-коннект к БД установлен; обязательные переменные не дефолтные.'

    # ============ ЧЕК-ЛИСТ ============
    Add-H1 'Чек-лист верификации (одинаков для A и B)'
    Add-Bullet '1. XSS-устойчивость: инъекция скрипта в SPA не извлекает access-токен (его нет в window/document). HttpOnly-cookie не читается JavaScript.'
    Add-Bullet '2. Logout действительно отзывает: после /logout старый refresh-cookie, подставленный вручную, возвращает 401.'
    Add-Bullet '3. Rotation + reuse detection: отправить refresh дважды → второй раз revoke всей session + запись в auth_events.'
    Add-Bullet '4. Brute-force: 6-я попытка login → 429; 4-я попытка → CAPTCHA; 11-я → аккаунт залочен.'
    Add-Bullet '5. RLS: psql под app_authenticated (B) / пользовательский JWT через PostgREST (A) — SELECT * возвращает только строки своего counterparty_id.'
    Add-Bullet '6. MFA: endpoint с requireAal(''aal2'') отвечает 403 ''aal2 required'' до verify и 200 после.'
    Add-Bullet '7. HTTPS: curl -I http://host → 301 на HTTPS; curl https://host содержит заголовок Strict-Transport-Security.'
    Add-Bullet '8. CSP: inline-скрипт без nonce блокируется браузером (DevTools → Console).'
    Add-Bullet '9. Enumeration: /login с несуществующим email и с существующим+неверным паролем — одинаковое сообщение и сопоставимая латентность (±20 мс).'
    Add-Bullet '10. OWASP ZAP baseline на /login, /refresh, /logout, /mfa/* — без High/Medium.'
    Add-Bullet '11. Sessions UX: /me/sessions возвращает список устройств, DELETE /me/sessions/:id — отзывает конкретную сессию. Email приходит только на новый login.'

    # ============ СРАВНИТЕЛЬНАЯ ТАБЛИЦА ============
    Add-H1 'Сравнительная таблица параметров A и B'

    # Insert an empty paragraph before the table
    $sel.Style = 'Normal'

    $rows = @(
        @('Критерий', 'Вариант A (Supabase)', 'Вариант B (Yandex PG)'),
        @('Провайдер Auth', 'Supabase GoTrue (managed)', 'Собственный Node.js auth-API'),
        @('Хэш паролей (базовый)', 'bcrypt (Supabase-managed)', 'bcrypt cost=12'),
        @('Хэш паролей (апгрейд)', 'Не применимо (managed)', 'Argon2id m=19 MiB, t=2, p=1 + KMS-pepper'),
        @('HIBP / leaked-password', 'Supabase dashboard toggle', 'HIBP k-anonymity API на BFF'),
        @('Оценка стойкости пароля', 'zxcvbn ≥3 на BFF', 'zxcvbn ≥3 на BFF'),
        @('Access-токен', 'Supabase JWT, HttpOnly __Host-access cookie, TTL 15 мин', 'Собственный JWT Ed25519, в памяти клиента, Bearer, TTL 15 мин'),
        @('Refresh-токен', 'Supabase refresh-JWT, HttpOnly __Host-refresh cookie, TTL 7 дней', 'Opaque CSPRNG 256 бит, HttpOnly __Host-refresh cookie, TTL 14 дн rolling, absolute 90 дн'),
        @('Хранение refresh в БД', 'У Supabase', 'SHA-256 хэш + session_id, rolling rotation, reuse-detection'),
        @('Верификация JWT', 'JWKS (createRemoteJWKSet)', 'Локальный public-key (Ed25519)'),
        @('Logout (реальный revoke)', 'supabaseAdmin.auth.admin.signOut(scope=global)', 'revoke в refresh_tokens + sessions.invalidated_at'),
        @('MFA', 'Supabase TOTP, aal1/aal2', 'Собственный TOTP, секреты зашифрованы KMS, aal1/aal2'),
        @('Rate-limit login', '5/15мин/IP + 10/час/email', '5/15мин/IP + 10/час/email'),
        @('CAPTCHA', 'Turnstile после 3 неудач', 'Turnstile после 3 неудач'),
        @('RLS', 'Обязательно, custom_access_token_hook для claims', 'Обязательно, SET LOCAL app.* + роль без BYPASSRLS'),
        @('Cookie-флаги', 'HttpOnly; Secure; SameSite=Strict; __Host-', 'HttpOnly; Secure; SameSite=Strict; __Host-'),
        @('CSRF', 'SameSite=Strict + double-submit token', 'SameSite=Strict + double-submit token'),
        @('TLS / HSTS', 'Nginx 80→443, HSTS preload', 'Nginx 80→443, HSTS preload'),
        @('CSP', 'Strict, nonce, без unsafe-inline', 'Strict, nonce, без unsafe-inline'),
        @('Session UX', 'GET/DELETE /me/sessions, email только на новый login', 'GET/DELETE /me/sessions, email только на новый login'),
        @('Аудит', 'auth_events + Supabase Auth Log', 'auth_events + unauthorized_access_log + Yandex Cloud Logging'),
        @('Секреты', 'service_role в Lockbox/Vault, anon_key не нужен на клиенте', 'JWT keys, pepper, SMTP, CAPTCHA — в Yandex Lockbox'),
        @('DB', 'Supabase Postgres (managed)', 'Yandex Managed PostgreSQL (sslmode=verify-full, PITR)'),
        @('Зависимость от внешнего SaaS', 'Высокая (supabase.com)', 'Низкая (только Yandex)'),
        @('Скорость внедрения', 'Быстро', 'Медленнее (свой код)'),
        @('Объём кастомного кода в зоне auth', 'Низкий (BFF-прокси)', 'Высокий (весь auth свой)')
    )

    $nRows = $rows.Count
    $nCols = 3

    $range = $sel.Range
    $table = $doc.Tables.Add($range, $nRows, $nCols)
    $table.Borders.Enable = $true
    $table.AllowAutoFit = $true
    $table.PreferredWidthType = 2  # wdPreferredWidthPercent
    $table.PreferredWidth = 100

    for ($r = 0; $r -lt $nRows; $r++) {
        for ($c = 0; $c -lt $nCols; $c++) {
            $cell = $table.Cell($r + 1, $c + 1)
            $cell.Range.Text = $rows[$r][$c]
            if ($r -eq 0) {
                $cell.Range.Font.Bold = $true
                $cell.Shading.BackgroundPatternColor = 15132390  # светло-серый
            }
        }
    }

    # Move selection after the table
    $sel.EndKey(6, 0) | Out-Null  # wdStory = 6
    $sel.TypeParagraph()

    # ============ ЗАКЛЮЧЕНИЕ ============
    Add-H1 'Какой вариант выбрать для PassDesk'
    Add-Bullet 'Вариант A (Supabase) — если приоритет: скорость разработки и меньше кастомного кода в зоне безопасности. Встроенные MFA, leaked-password protection, audit log из коробки. Компромисс: внешняя зависимость, оплата по росту, данные на серверах провайдера.'
    Add-Bullet 'Вариант B (Yandex PG) — если приоритет: полный контроль, on-premise-совместимость, соответствие 152-ФЗ (данные в РФ), интеграции со СКУД и специфичные audit-требования. Компромисс: выше операционные издержки и ответственность за безопасность целиком лежит на команде.'
    Add-Bullet 'Для текущего PassDesk ближе B — это эволюция существующей реализации (JWT + bcrypt + Express), а не миграция. A предпочтительнее, если в ближайший год появляются мобильное приложение, SSO/OAuth-провайдеры, magic-link и нужно быстро разворачивать новые auth-сценарии без своего кода.'

    # ============ SAVE ============
    $wdFormatDocumentDefault = 16
    $doc.SaveAs2($outPath, $wdFormatDocumentDefault)
    $doc.Close($false)

    Write-Host "OK: $outPath"
    if (Test-Path $outPath) {
        $size = (Get-Item $outPath).Length
        Write-Host "Size: $size bytes"
    }
} finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
