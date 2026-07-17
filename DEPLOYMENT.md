# PassDesk — Production Deployment Architecture

**Актуально на:** 2026-07-17  
**Сервер:** selectel_main (`hub`, 45.80.128.254)

---

## Обзор

PassDesk развёрнут в Docker-окружении на выделенном VPS с ISPmanager, где также работают другие проекты (matcheck, refhub, hubtender). Приложение изолировано через отдельного unix-пользователя, nginx reverse proxy и внутренние Docker-сети.

---

## Серверная инфраструктура

### Хост
- **OS:** Ubuntu 24.04 LTS
- **Docker:** 27.x + Compose V2
- **Web-сервер:** Nginx 1.27
- **Панель:** ISPmanager Lite 6.138
- **RAM:** ~4 GB (shared с другими проектами)
- **Disk:** 50 GB (76% используется, PassDesk ~5 GB)

### Unix-пользователь
- **User:** `passdesk`
- **Home:** `/home/passdesk`
- **Groups:** `docker` (для запуска контейнеров без sudo)

---

## Структура проекта на сервере

```
/home/passdesk/
├── .postgresql/
│   └── root.crt              # SSL cert для подключения к внешней БД
└── portal/                   # Git repo
    ├── .env                  # Production env vars (chmod 600)
    ├── cert/
    │   └── root.crt          # Копия SSL cert (для монтирования в контейнер)
    ├── docker-compose.server.yml
    ├── docker-compose.override.yml  # (опционально, не используется сейчас)
    ├── client/
    ├── server/
    ├── scripts/
    │   └── deploy.sh         # Скрипт для обновления проекта
    └── ...
```

### Ключевые файлы (не в git)

#### `/home/passdesk/portal/.env`
Содержит:
- `NODE_ENV=production`
- `CLIENT_URL=https://passdesk.click`
- `SERVER_URL=https://passdesk.click`
- `DB_HOST=<external_fqdn>` — внешняя управляемая PostgreSQL (Yandex Managed)
- `DB_SSL=true` + `DB_SSL_CA_PATH=/app/cert/root.crt`
- `STORAGE_PROVIDER=cloudru` — Cloud.ru S3
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, encryption keys
- OCR, SKUD, Redis, S3 credentials

**Важно:** `.env` должен иметь `chmod 600` и owner `passdesk:passdesk`.

#### `/home/passdesk/.postgresql/root.crt`
SSL-сертификат для подключения к внешней БД. Монтируется в контейнер сервера через `HOST_CERT_PATH`.

---

## Docker Compose

### Используемый файл
`docker-compose.server.yml` — production-конфигурация.

### Compose project
- **Name:** `portal`
- **Working dir:** `/home/passdesk/portal`
- **Запуск:** `docker compose -p portal -f docker-compose.server.yml up -d --build`

### Контейнеры

| Контейнер | Image | Назначение | Порты (host) | Health check |
|-----------|-------|------------|--------------|--------------|
| `passdesk_server` | `portal-server` (Node 20 Alpine) | Backend API | `0.0.0.0:5003→5000` | `wget http://127.0.0.1:5000/health` |
| `passdesk_client` | `portal-client` (Nginx 1.27 Alpine) | Frontend SPA | `0.0.0.0:5173→5173` | `wget http://127.0.0.1:5173/healthz` |
| `passdesk_redis` | `redis:7-alpine` | Кэш, очереди | — (internal) | `redis-cli ping` |
| `passdesk_postgres` | `postgres:17-alpine` | **Не используется** (БД внешняя) | — (internal) | `pg_isready` |

**Примечание:** Контейнер `passdesk_postgres` запущен (для совместимости compose), но приложение подключается к **внешней** PostgreSQL через `DB_HOST`.

### Volumes
- `portal_postgres_data` — не используется (БД внешняя)
- `portal_redis_data` — персистентные данные Redis
- Bind mount: `/home/passdesk/.postgresql/root.crt` → `/app/cert/root.crt:ro`

### Network
- `portal_default` (bridge) — внутренняя сеть для межконтейнерного общения

---

## Nginx Reverse Proxy

### Конфигурация
`/etc/nginx/sites-enabled/passdesk.click` (symlink на `sites-available/passdesk.click`)

```nginx
server {
    server_name passdesk.click www.passdesk.click;
    
    # Фронтенд
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        # Real IP для логов/CORS
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:5003/api/;
        # ... аналогичные proxy_set_header
    }

    # HTTPS (managed by Certbot)
    listen 443 ssl;
    listen [::]:443 ssl;
    ssl_certificate /etc/letsencrypt/live/passdesk.click/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/passdesk.click/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name passdesk.click www.passdesk.click;
    return 301 https://$host$request_uri;
}
```

### SSL/TLS
- **Сертификат:** Let's Encrypt (автообновление через certbot)
- **Домены:** `passdesk.click`, `www.passdesk.click`
- **Срок:** ~90 дней, auto-renew
- **Управление:** `certbot renew` (systemd timer)

---

## Внешние зависимости

### База данных
- **Тип:** Yandex Managed PostgreSQL (внешний хост)
- **Подключение:** SSL required (`DB_SSL=true`)
- **Схема:** управляется миграциями (`npm run db:migrate` в `server/`)
- **Пул соединений:** настраивается через `DB_POOL_*` env vars

### Хранилище файлов
- **Провайдер:** Cloud.ru S3 (или Yandex S3 — через `STORAGE_PROVIDER`)
- **Bucket:** указан в `CLOUDRU_S3_BUCKET_NAME`
- **Шифрование:** field + file encryption (AES-256, настраивается через `*_ENCRYPTION_KEYS`)

### Очереди и кэш
- **Redis:** внутренний контейнер `passdesk_redis`
- **Использование:** upload/OCR queues, сессии, кэш

### Внешние API
- **OCR:** OpenRouter API (через env `OCR_OPENROUTER_*`)
- **SKUD:** Sigur API (если `SKUD_ENABLED=true`)
- **Email/SMS webhooks:** настраиваются через `*_WEBHOOK_URL`

---

## CI/CD

### GitHub Actions
`.github/workflows/deploy.yml` — автодеплой на push в `main`.

**Секреты:**
- `SSH_HOST` → `45.80.128.254`
- `SSH_USER` → `root`
- `SSH_KEY` → приватный ключ для доступа к серверу
- `SSH_PORT` → `22`

**Процесс:**
1. SSH на сервер
2. `cd /home/passdesk/portal`
3. `git fetch && git reset --hard origin/main`
4. `docker compose -p portal -f docker-compose.server.yml up -d --build --force-recreate`

### Ручной деплой
На сервере от пользователя `passdesk`:
```bash
cd /home/passdesk/portal
./scripts/deploy.sh
```

Скрипт выполняет:
- Git pull + reset
- Docker build + recreate
- Health checks
- Логирование в `logs/deploy-YYYYMMDD-HHMMSS.log`

---

## Мониторинг и логи

### Health checks
- **Client:** `https://passdesk.click/` → 200
- **Server:** `https://passdesk.click/api/v1/health` → `{"status":"OK"}`
- **Docker:** `docker ps --filter "name=passdesk_"` → все `(healthy)`

### Логи
```bash
# Server
docker logs passdesk_server --tail 100 -f

# Client
docker logs passdesk_client --tail 100 -f

# Nginx
tail -f /var/log/nginx/access.log | grep passdesk
tail -f /var/log/nginx/error.log
```

### Метрики
- **Uptime:** `docker ps --filter "name=passdesk_" --format '{{.Status}}'`
- **Disk:** `df -h /` + `du -sh /home/passdesk/portal`
- **Docker volumes:** `docker system df -v`

---

## Безопасность

### Изоляция
- Отдельный unix-user `passdesk`
- Docker network изолирована от других проектов
- Nginx — единственная точка входа (порты 80/443)

### Secrets
- `.env` с `chmod 600`, не в git
- SSH ключи не хранятся в репо
- DB пароли, API токены — только в `.env`

### SSL
- HTTPS обязателен (HTTP → HTTPS redirect)
- TLS 1.2+ (настройки Let's Encrypt)

### Firewall
- Открыты: 22 (SSH), 80 (HTTP), 443 (HTTPS)
- Docker порты 5173/5003 **не** изолированы на `127.0.0.1` (публичны `0.0.0.0`), но защищены nginx

**Рекомендация:** Добавить firewall правила для блокировки прямого доступа к 5173/5003 извне.

---

## Backup & Rollback

### Данные для бакапа
1. **База данных:** управляется Yandex (PITR, автобакапы)
2. **Redis data:** `docker volume portal_redis_data` (не критично, можно пересоздать)
3. **Конфигурация:** `/home/passdesk/portal/.env`, nginx vhost
4. **S3 файлы:** управляются провайдером (Cloud.ru)

### Rollback на предыдущий commit
```bash
cd /home/passdesk/portal
git log --oneline -10  # выбрать commit
git checkout <commit-hash>
docker compose -p portal -f docker-compose.server.yml up -d --build --force-recreate
```

### Аварийное восстановление
См. `ROLLBACK-PLAN.md` в репо.

---

## Troubleshooting

### Контейнеры не стартуют
```bash
docker logs passdesk_server --tail 100
docker inspect passdesk_server | grep -A10 Health
```

Частые причины:
- `.env` отсутствует или неправильные права
- `DB_HOST` недоступен (проверить SSL cert)
- Недостаточно RAM (проверить `docker stats`)

### Nginx 502 Bad Gateway
```bash
systemctl status nginx
curl http://127.0.0.1:5173/healthz  # client
curl http://127.0.0.1:5003/health   # server
```

### SSL certificate renewal
```bash
certbot renew --dry-run
systemctl status certbot.timer
```

---

## Масштабирование

### Вертикальное
- Увеличить RAM/CPU VPS
- Настроить `DB_POOL_MAX`, `REDIS_*` для большей нагрузки

### Горизонтальное
- Вынести Redis на отдельный сервер (Redis Cluster)
- Балансировщик нагрузки перед несколькими инстансами `passdesk_server`
- CDN для статики (`passdesk_client`)

### Оптимизация
- Включить nginx gzip/brotli для статики
- Настроить кэширование статики в nginx
- Включить HTTP/2 в nginx

---

## Контакты и ссылки

- **Репозиторий:** `https://github.com/saztonov/PassDesk`
- **Production:** `https://passdesk.click`
- **Панель ISPmanager:** `https://45.80.128.254:1500`
- **Документация миграции:** `MIGRATION-PLAN.md`, `ROLLBACK-PLAN.md`
- **Архитектура:** этот файл (`DEPLOYMENT.md`)
