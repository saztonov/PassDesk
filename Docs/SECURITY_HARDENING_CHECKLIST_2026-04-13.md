# Security Hardening Checklist (PAS-57)

Date: 2026-04-13
Scope: `server/src` runtime path (`raw SQL`, `auth`, `upload`, `CORS/body limits`)

## 1) Raw SQL review

Checklist:
- [x] Найдены все runtime-вызовы `sequelize.query` / `Model.sequelize.query`
- [x] Проверено, что пользовательские значения передаются через `replacements`
- [x] Для динамических SQL-фрагментов используется ограниченный whitelist/константы
- [x] High-risk SQL injection места устранены

Result:
- Проверены основные runtime-точки:
  - `server/src/controllers/counterparty.controller.js`
  - `server/src/controllers/employeeDocumentsTable.controller.js`
  - `server/src/controllers/employeeDocumentType.controller.js`
  - `server/src/controllers/ocr.controller.js`
  - `server/src/controllers/skud.controller.js`
  - `server/src/services/skud/SkudSyncService.js`
  - `server/src/queues/employeeOcr/queue.js`
- Все пользовательские параметры подставляются через `replacements`.
- Динамические SQL-фрагменты формируются из контролируемых выражений (join/where сегменты из предопределенной логики).
- High-risk SQL injection не найден.

Residual risk:
- `server/src/database/check-connection.js` использует интерполяцию имени таблицы из уже полученного списка `information_schema`; это админский диагностический скрипт, не API-runtime путь.

## 2) Auth hardening

Checklist:
- [x] JWT verify ограничен `algorithms: ["HS256"]` в middleware
- [x] JWT sign явно использует `algorithm: "HS256"`
- [x] Обработаны edge-cases logout с невалидным токеном
- [x] Исправлен приоритет ошибки для неактивного аккаунта
- [x] Добавлены регрессионные тесты

Result:
- `HS256` закреплен в:
  - `server/src/middleware/auth.js`
  - `server/src/controllers/auth.controller.js`
  - `server/src/services/fileDownloadTokenService.js`
- Исправлена логика в `authenticate`: при существующем, но неактивном пользователе возвращается корректный `403`.
- Добавлены тесты:
  - `server/src/middleware/auth.test.js`
  - `server/src/services/fileDownloadTokenService.test.js`

## 3) Upload hardening

Checklist:
- [x] Лимиты читаются через безопасный парсер положительных int
- [x] Валидация пустых и oversized файлов
- [x] MIME/extension сверяются с сигнатурой файла
- [x] Добавлены регрессионные тесты

Result:
- Централизован лимит файла: `MAX_FILE_SIZE_BYTES` в `server/src/middleware/upload.js`.
- Добавлены явные проверки `size <= 0` и `size > MAX_FILE_SIZE_BYTES`.
- Добавлены тесты:
  - `server/src/middleware/upload.test.js`

## 4) CORS, rate-limit, body limits

Checklist:
- [x] CORS origins нормализуются и проверяются строго
- [x] Ограничен список разрешенных HTTP методов
- [x] Установлен `maxAge` preflight-кэша
- [x] Body limits задаются через env-переменные

Result:
- Обновлен `server/src/server.js`:
  - строгая проверка origin через `Set` и нормализацию (`trim`, без хвостового `/`),
  - `methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]`,
  - `maxAge: 600`,
  - лимиты тела запроса через `JSON_BODY_LIMIT` и `URLENCODED_BODY_LIMIT`.

## 5) Quick-QR pre-release gate (PAS-67)

Checklist:
- [x] Добавлен обязательный релиз-гейт для quick-qr в API (env-флаг).
- [x] Условия включения задокументированы в env/example и docker-compose.
- [x] Негативные тест-кейсы на выключенный гейт.

Result:
- `server/src/routes/mobileEmployeeAccess.routes.js`:
  - gate `MOBILE_ACCESS_QUICK_QR_RELEASED=true` обязателен для `/mobile-access/quick-qr`.
- Добавлены переменные окружения:
  - `server/.env.example`
  - `docker-compose.yml`, `docker-compose.server.yml`, `docker-compose.prod.yml`
- Тесты:
  - `server/src/routes/mobileEmployeeAccess.routes.test.js`

## Verification

Executed locally:
- `cd server && npm run lint`
- `cd server && npm run test`

Status:
- PAS-57 DoD выполнен: чеклист оформлен, high-risk места закрыты, регрессионные security-тесты добавлены.
