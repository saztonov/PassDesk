# Архитектура развёртывания PassDesk на VPS

Дата актуализации: 2026-04-29

Документ описывает, как развёрнут продакшн `https://passdesk.click` на VPS, какие пользователи, пути, контейнеры и команды используются для деплоя. Информация собрана в ходе сессии 2026-04-29 при разборе бага «ot_admin не видит «Справочники» в меню».

## 1. Доступ к VPS

| Параметр | Значение |
|----------|----------|
| Hostname | `otitb` |
| Доменное имя | `passdesk.click` |
| Пользователь сборки/деплоя | `passdesk` (`su - passdesk` из root) |
| Рабочий каталог | `/home/passdesk/portal` (он же `~/portal`) |
| Git remote | `https://github.com/saztonov/PassDesk` (HTTPS) |
| Git push с VPS | **не используется** — только pull |
| Git identity на сервере | **не настроена** (умышленно) |

**Принцип работы с git:** все коммиты делаются на локальной машине (где настроена identity и есть push-доступ), на VPS выполняется только `git pull --ff-only` + сборка/перезапуск контейнеров.

## 2. Топология контейнеров (docker compose, prod-профиль)

| Контейнер | Образ | Маппинг портов | Назначение |
|-----------|-------|----------------|-------------|
| `passdesk_redis` | `redis:7-alpine` | (не публикуется) | Кеш, сессии, скуд-очереди |
| `passdesk_server` | `portal-server:latest` (build из `./server`) | `5003 → 5000` | Express API, JWT, БД, OCR, SKUD, OT, 1c-sync |
| `passdesk_client` | `portal-client:latest` (build из `./client`, multi-stage) | `5173 → 5173` | Nginx со статикой Vite + reverse-proxy `/api/*` → server:5000 |

**Сеть:** дефолтная docker compose, контейнеры обращаются друг к другу по DNS-имени сервиса (`redis`, `server`, `client`).

**TLS** терминируется внешним reverse-proxy (host-side nginx), который проксирует `https://passdesk.click` на `127.0.0.1:5173`. Внутри контейнера `passdesk_client` HTTP без TLS.

## 3. Артефакты сборки и конфигурации

| Файл | Роль |
|------|------|
| `~/portal/docker-compose.prod.yml` | Production-композ. Все обязательные env через `${VAR:?...}` (старт упадёт, если не задано). |
| `~/portal/client/Dockerfile` | Multi-stage: `node:20-alpine` builder (`npm ci` + `npm run build`) → `nginx:1.27-alpine` runtime |
| `~/portal/client/nginx.conf` | gzip, security headers, кеш `assets/*` 1y immutable, no-cache `index.html`, `/api/*` → `http://server:5000`, `/healthz` |
| `~/portal/server/Dockerfile` | Node:20-alpine, `npm ci` встроен в build (рестарт контейнера не дёргает npm registry) |
| `~/portal/.env` | Все секреты: DB, JWT, S3, OCR, Redis, Telegram, SKUD, Field encryption keys |
| `~/portal/cert/root.crt` | CA для TLS-подключения к внешней БД (PostgreSQL); монтируется в server как `/app/cert/root.crt:ro` |

Билд-аргументы клиента (из `docker-compose.prod.yml`, инлайнятся Vite в bundle):
- `VITE_MOBILE_ACCESS_ENABLED`
- `VITE_ENABLE_DEBUG_ROUTES`
- `VITE_CLIENT_URL`
- `VITE_SERVER_URL`

## 4. Внешние зависимости (через `.env`)

| Сервис | Параметры | Заметки |
|--------|-----------|---------|
| **PostgreSQL** | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Внешняя. SSL опционально через `DB_SSL=true` + `DB_SSL_CA_PATH=/app/cert/root.crt`. Пул: `DB_POOL_MAX=20`, `DB_POOL_MIN=2`, роль `api`. |
| **S3** (основной) | `STORAGE_PROVIDER=cloudru`, `CLOUDRU_S3_*` | Бакет на beget.cloud (`s3.ru1.storage.beget.cloud`, регион `ru1`). |
| **S3** (резерв) | `YANDEX_S3_*` | Yandex Object Storage. |
| **OCR** | `OCR_PROVIDER=openrouter`, `OCR_API_KEY`/`OCR_OPENROUTER_API_KEY` | Модель по умолчанию `qwen/qwen3.5-35b-a3b`, scan-fallback `google/gemini-3.1-flash-lite-preview`. |
| **SKUD** | `SKUD_PROVIDER=sigur`, `SKUD_*` | По умолчанию `SKUD_ENABLED=false`. Webhook auth — basic + IP allowlist. |
| **Telegram** | `TELEGRAM_BOT_*`, `MOBILE_ACCESS_*` | По умолчанию `TELEGRAM_BOT_ENABLED=false`. Используется для laborer-кабинета и mobile-access. |
| **Redis** (внутр.) | `REDIS_HOST=redis`, `REDIS_PORT=6379`, `REDIS_PASSWORD` | `redis:7-alpine` в той же compose-сети, AOF persistence (volume `redis_data`). |

## 5. Шифрование на стороне сервера

- `FIELD_ENCRYPTION_ENABLED=true` — поля `*Enc` в БД, Sequelize-геттеры расшифровывают на чтении. Версия активного ключа `APP_FIELD_ENCRYPTION_ACTIVE_KEY_VERSION=v1`. Ключи в `APP_FIELD_ENCRYPTION_KEYS`.
- `FILE_ENCRYPTION_ENABLED=true` для типов: `passport,kig,patent_front,patent_back,application_scan` (`FILE_ENCRYPTION_SENSITIVE_DOC_TYPES`).
- `FIELD_ENCRYPTION_KEEP_LEGACY_PLAINTEXT=false` — режим полного шифрования, plain-текст для чувствительных полей в БД недопустим.
- `APP_FIELD_HASH_PEPPER` — pepper для деривации хешей чувствительных полей.

## 6. Healthchecks

| Сервис | Команда | Интервал | Условие здоровья |
|--------|---------|----------|------------------|
| redis | `redis-cli -a $REDIS_PASSWORD ping` | 5s | exit 0 |
| server | `wget -qO- http://127.0.0.1:5000/health` | 20s | HTTP 200 + `{"status":"OK","timestamp":...}` |
| client | `wget -qO- http://127.0.0.1:5173/healthz` | 20s | HTTP 200 `ok\n` (nginx-эндпоинт) |

## 7. Стандартный workflow деплоя

### На локальной машине

```bash
git checkout main
# правки → git add → git commit → git push origin main
```

### На VPS

```bash
# вход
ssh root@<vps>            # затем:
su - passdesk
cd ~/portal

# подтянуть код
git pull --ff-only
git log --oneline -5

# пересобрать только то, что менялось
# Vite-сборка клиента всегда с --no-cache (гарантирует свежий bundle):
docker compose -f docker-compose.prod.yml build --no-cache client

# для сервера обычно достаточно без --no-cache (layer-cache корректно инвалидирует COPY . .);
# с --no-cache — если есть сомнения:
docker compose -f docker-compose.prod.yml build server

# поднять обновлённые контейнеры
docker compose -f docker-compose.prod.yml up -d client server
docker compose -f docker-compose.prod.yml ps

# проверить здоровье
docker logs --tail=80 passdesk_server | grep -Ei 'migrat|listen|error' | head -30
docker exec passdesk_server sh -c 'wget -qO- http://127.0.0.1:5000/health'
```

### Миграции БД

Применяются **автоматически** при старте контейнера сервера через
```yaml
command: sh -c "npm run db:migrate && npm run start"
```
(`docker-compose.prod.yml`, секция `server`). Скрипт миграций — `server/src/database/runMigrations.js`, идемпотентный через таблицу версий. Отдельно вручную запускать миграции не нужно.

## 8. Известные грабли (lessons learned)

- **`git pull` падает с `fatal: You have not concluded your cherry-pick (CHERRY_PICK_HEAD exists)`** — на сервере висит незавершённый cherry-pick (например, после ошибки «Committer identity unknown»). Лечится `git cherry-pick --abort`.

- **«Committer identity unknown» при попытке коммитить на VPS** — git identity на сервере не настроена. Если cherry-pick/commit действительно нужен локально на сервере: `git config user.email "..." && git config user.name "..."` (без `--global`). Но рекомендованный путь — делать коммиты только на локальной машине.

- **Server-build с `CACHED [5/5] COPY . .` = код не обновился.** Если в логе `docker compose build server` слой `COPY . .` взят из кеша, значит `git pull` не подтянул новый код (или его не было). Проверьте `git log --oneline -5`.

- **`--no-cache` обязателен для client** (Vite-bundle: иначе можно отдать на прод старый JS). Для server обычно не требуется — layer-cache корректно инвалидируется при изменении `./server/`.

- **Файлы из корня репо в docker-образ не попадают.** Build-context для client = `./client/`, для server = `./server/`. Корневые файлы (например, локальные PowerShell-скрипты) безвредны для прода, но и недоступны внутри контейнера.

- **Прямой URL может работать без пункта меню.** Если `/api`-роут разрешает роль, но Sidebar для неё не добавляет пункт меню — пользователь увидит 404 в навигации, но открытие по URL пройдёт. Полезно при диагностике (см. кейс ot_admin → `/directories?tab=counterparties`).

## 9. Верификация после деплоя

| Что | Команда |
|-----|---------|
| HEAD на нужном коммите | `cd ~/portal && git log --oneline -3` |
| Образ клиента пересобран | `docker inspect passdesk_client --format '{{.Created}}'` (должно быть «только что») |
| Bundle содержит ожидаемое | `docker exec passdesk_client sh -c 'grep -c "<маркер>" /usr/share/nginx/html/assets/<chunk>-*.js'` |
| Сервер живой и без ошибок | `docker logs --tail=80 passdesk_server \| grep -Ei 'error\|migrat\|listen'` |
| Server health | `docker exec passdesk_server sh -c 'wget -qO- http://127.0.0.1:5000/health'` → `{"status":"OK",...}` |
| Client health | `curl -s http://127.0.0.1:5173/healthz` → `ok` |
| Под нужной ролью в браузере | hard reload (Ctrl+Shift+R) на `https://passdesk.click`, проверить целевую функциональность |

## 10. Что делать НЕ надо

- ~~Делать `git config --global` на VPS под `passdesk`~~ — это настройка для пользователя, нам нужна локальная (без `--global`).
- ~~Запускать миграции вручную~~ — они идут из `command:` в compose.
- ~~Билдить с `--build` в `docker compose up`~~ — отдельные `build` шаги дают видимость и контроль над логом сборки.
- ~~Использовать `git push --force` к origin/main~~ — main защищена политикой, плюс может затереть чужие коммиты.
- ~~Чистить `_make_compare_docx.ps1` и подобные локальные файлы из ветки `feature/sync-1c`~~ — на работу прода они не влияют (в build-context контейнеров не попадают).

## Источники истины

- `docker-compose.prod.yml` — единственный canonical компоуз для продакшна.
- `client/Dockerfile`, `client/nginx.conf` — как клиент собирается и отдаётся.
- `server/Dockerfile` — как собирается сервер.
- `.env` на VPS — все рантайм-секреты (в репо нет).
- `Docs/ROLES_ACCESS_MATRIX_2026-04-22.md` — кто что видит в UI.
- `Docs/SECURITY_HARDENING_CHECKLIST_2026-04-13.md` — security-настройки.
