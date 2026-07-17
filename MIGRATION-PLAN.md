# PassDesk VPS1 → selectel_main (VPS2) — безопасная миграция

**Цель:** перенести PassDesk с VPS1 (`otitb`, 185.31.165.250) на selectel_main (`hub`, 45.80.128.254) без ущерба для работающих там сайтов (matcheck, refhub, hubtender, /srv/sites/*).

**Критично:** VPS2 — **мультитенантный прод**. Любой сбой nginx/docker может уронить чужие сайты.

---

## Этап 0: Бакап VPS2 (перед любыми изменениями)

### 0.1 Создать snapshot-каталог
```bash
BACKUP_ROOT="/root/backups/passdesk-migration-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_ROOT"/{nginx,docker,system}
```

### 0.2 Бакап nginx (весь конфиг)
```bash
tar -czf "$BACKUP_ROOT/nginx/nginx-full-backup.tar.gz" \
  /etc/nginx/nginx.conf \
  /etc/nginx/sites-available \
  /etc/nginx/sites-enabled \
  /etc/nginx/conf.d \
  /etc/nginx/snippets 2>/dev/null || true
# Список активных vhosts
ls -la /etc/nginx/sites-enabled > "$BACKUP_ROOT/nginx/sites-enabled-before.txt"
# Тест конфига
nginx -t > "$BACKUP_ROOT/nginx/nginx-t-before.txt" 2>&1
```

### 0.3 Состояние docker
```bash
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' \
  > "$BACKUP_ROOT/docker/containers-before.txt"
docker compose ls > "$BACKUP_ROOT/docker/compose-projects-before.txt" 2>/dev/null || true
docker network ls > "$BACKUP_ROOT/docker/networks-before.txt"
```

### 0.4 Системные порты/сервисы
```bash
ss -tlnp > "$BACKUP_ROOT/system/listen-ports-before.txt" 2>/dev/null
systemctl list-units --type=service --state=running > "$BACKUP_ROOT/system/services-before.txt"
df -h > "$BACKUP_ROOT/system/disk-before.txt"
free -h > "$BACKUP_ROOT/system/mem-before.txt"
```

### 0.5 Сохранить путь к бакапу
```bash
echo "$BACKUP_ROOT" > /root/.passdesk-migration-backup-path
echo "Backup saved: $BACKUP_ROOT"
```

**Результат:** полный снимок VPS2 для rollback. Откат = восстановить nginx из tar + `docker compose` restart если что-то сломалось.

---

## Этап 1: Подготовка окружения на selectel_main (без запуска приложения)

### 1.1 Создать unix-пользователя `passdesk`
```bash
useradd -m -s /bin/bash passdesk
# Добавить в docker group если нужен docker без sudo
usermod -aG docker passdesk
```

### 1.2 Клонировать репозиторий
```bash
su - passdesk -c "
  git clone https://github.com/saztonov/PassDesk.git /home/passdesk/portal
  cd /home/passdesk/portal
  git checkout 417f23b  # текущий commit на VPS1
"
```

### 1.3 Скопировать .env и cert/ с VPS1 (через локальную машину или scp между VPS)
**Вариант через Windows:**
```powershell
# Скачать с VPS1
scp -o BatchMode=yes passdesk-vps1:/home/passdesk/portal/.env "$env:TEMP\passdesk_env_vps1.txt"
scp -o BatchMode=yes passdesk-vps1:/home/passdesk/portal/cert/root.crt "$env:TEMP\passdesk_root_crt.txt"
# Загрузить на VPS2
scp -o BatchMode=yes "$env:TEMP\passdesk_env_vps1.txt" passdesk-vps2:/tmp/passdesk.env
scp -o BatchMode=yes "$env:TEMP\passdesk_root_crt.txt" passdesk-vps2:/tmp/root.crt
# Очистить локальный temp
Remove-Item "$env:TEMP\passdesk_env_vps1.txt","$env:TEMP\passdesk_root_crt.txt" -Force
```
**На VPS2:**
```bash
mv /tmp/passdesk.env /home/passdesk/portal/.env
mkdir -p /home/passdesk/portal/cert
mv /tmp/root.crt /home/passdesk/portal/cert/root.crt
chown -R passdesk:passdesk /home/passdesk/portal
chmod 600 /home/passdesk/portal/.env
chmod 644 /home/passdesk/portal/cert/root.crt
```

### 1.4 Override docker-compose: порты только на 127.0.0.1
Создать `/home/passdesk/portal/docker-compose.override.yml`:
```yaml
services:
  client:
    ports:
      - "127.0.0.1:5173:5173"  # вместо 0.0.0.0
  server:
    ports:
      - "127.0.0.1:5003:5000"
  # postgres НЕ поднимаем вообще - БД внешняя, зачем idle контейнер?
  postgres:
    profiles: ["disabled"]
```

### 1.5 Проверка перед сборкой
```bash
su - passdesk -c "
  cd /home/passdesk/portal
  ls -lh .env cert/root.crt
  docker compose -f docker-compose.server.yml config | head -40
"
```

**Результат:** окружение готово, но контейнеры **не запущены** — безопасно для VPS2.

---

## Этап 2: Локальное тестирование (без внешнего доступа)

### 2.1 Собрать и запустить compose
```bash
su - passdesk -c "
  cd /home/passdesk/portal
  docker compose -p portal -f docker-compose.server.yml up -d --build
"
```

### 2.2 Проверить здоровье контейнеров
```bash
docker ps --filter "name=passdesk_" --format 'table {{.Names}}\t{{.Status}}'
# Ждать ~60s пока server/client станут healthy
for i in {1..12}; do
  docker ps --filter "name=passdesk_" --format '{{.Names}}\t{{.Status}}' | grep -E 'healthy|Up'
  sleep 5
done
```

### 2.3 Тест внутренних эндпоинтов (через localhost на VPS2)
```bash
curl -sS http://127.0.0.1:5173/healthz  # client должен 200
curl -sS http://127.0.0.1:5003/health   # server должен 200
curl -sS http://127.0.0.1:5003/api/v1/health || true  # если есть такой путь
```

### 2.4 Проверить логи на ошибки подключения к БД
```bash
docker logs passdesk_server --tail 100 | grep -iE 'error|fail|fatal|exception' || echo "no errors"
docker logs passdesk_client --tail 50
```

### 2.5 Убедиться, что другие сайты не затронуты
```bash
docker ps --filter "name=matcheck" --filter "name=refhub" --filter "name=hubtender" --format '{{.Names}}\t{{.Status}}'
# Все должны остаться Up/healthy
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:13001/health || true  # matcheck
curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:8180/ || true        # refhub
nginx -t  # конфиг всё ещё валиден
```

**Результат:** PassDesk работает на `127.0.0.1:5173/5003`, но снаружи недоступен. Другие сайты не сломались.

---

## Этап 3: Настройка nginx vhost (без DNS)

### 3.1 Создать nginx-конфиг для PassDesk
`/etc/nginx/sites-available/passdesk.click`:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name passdesk.click www.passdesk.click;

    # Временно: комментируем или ставим allow только ваш IP
    # allow YOUR_IP_HERE;
    # deny all;

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5003/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3.2 Включить vhost
```bash
ln -sf /etc/nginx/sites-available/passdesk.click /etc/nginx/sites-enabled/passdesk.click
```

### 3.3 Тест конфига (критично — не должен сломать другие сайты)
```bash
nginx -t
# Если ошибка — исправить, НЕ делать reload
```

### 3.4 Reload nginx (только если тест OK)
```bash
systemctl reload nginx
# Проверить статус
systemctl status nginx --no-pager
# Проверить что другие сайты отвечают
curl -I -H "Host: mat.su10.ru" http://127.0.0.1/
curl -I -H "Host: refhub.su10.ru" http://127.0.0.1/
```

**Результат:** nginx знает про `passdesk.click`, но DNS пока на VPS1 — трафик не идёт.

---

## Этап 4: Тестирование через /etc/hosts (до переключения DNS)

### 4.1 На локальной машине добавить в `C:\Windows\System32\drivers\etc\hosts`:
```
45.80.128.254  passdesk.click
```

### 4.2 Проверить доступ
```powershell
curl -v http://passdesk.click/
curl -v http://passdesk.click/api/v1/health
# Должны вернуть 200, HTML/JSON от PassDesk на VPS2
```

### 4.3 Функциональный тест (в браузере)
- Логин
- Загрузка файла (S3)
- OCR если есть
- SKUD если включён

### 4.4 Удалить строку из hosts после теста
```powershell
# Вернуть DNS на VPS1
```

**Результат:** PassDesk на VPS2 работает функционально, но реальный DNS ещё показывает на VPS1.

---

## Этап 5: Переключение DNS (CUTOVER)

### 5.1 Обновить A-записи (делает пользователь)
```
passdesk.click      A  45.80.128.254
www.passdesk.click  A  45.80.128.254
```

### 5.2 Дождаться пропагации DNS (5-30 мин)
```powershell
nslookup passdesk.click
# Должен вернуть 45.80.128.254
```

### 5.3 Получить Let's Encrypt сертификат
```bash
certbot --nginx -d passdesk.click -d www.passdesk.click
# Автоматически изменит /etc/nginx/sites-enabled/passdesk.click на 443 + redirects
nginx -t && systemctl reload nginx
```

### 5.4 Остановить старый PassDesk на VPS1 (оставить как fallback на 24ч)
```bash
# На VPS1
su - passdesk -c "cd /home/passdesk/portal && docker compose -p portal stop"
# Но не удалять контейнеры/volumes
```

**Результат:** PassDesk живёт на selectel_main, VPS1 — standby.

---

## Этап 6: Обновление CI/CD и финализация

### 6.1 Обновить GitHub Secrets
- `SSH_HOST` → `45.80.128.254`
- `SSH_USER` → `root`
- `SSH_KEY` → ключ для selectel_main
- `SSH_PORT` → `22`

### 6.2 Исправить путь в `.github/workflows/deploy.yml`
```yaml
script: |
  cd /home/passdesk/portal  # было /opt/apps/passdesk
  ...
```

### 6.3 Тест деплоя
Создать тестовый коммит → push в main → проверить GH Actions.

---

## Rollback (если что-то пошло не так)

### На VPS2:
```bash
# 1. Остановить PassDesk
su - passdesk -c "cd /home/passdesk/portal && docker compose -p portal down"

# 2. Удалить nginx vhost
rm /etc/nginx/sites-enabled/passdesk.click
nginx -t && systemctl reload nginx

# 3. Восстановить бакап nginx если сломали что-то чужое
BACKUP=$(cat /root/.passdesk-migration-backup-path)
tar -xzf "$BACKUP/nginx/nginx-full-backup.tar.gz" -C /
nginx -t && systemctl reload nginx
```

### DNS:
Вернуть A-записи на VPS1 (`185.31.165.250`).

### На VPS1:
```bash
su - passdesk -c "cd /home/passdesk/portal && docker compose -p portal start"
```

**TTL:** 5-15 мин до полного возврата трафика на VPS1.

---

## Checklist безопасности (перед каждым шагом)

- [ ] Этап 0: бакап VPS2 создан и протестирован (tar извлекается)
- [ ] Этап 1: `docker compose config` валиден, порты `127.0.0.1` только
- [ ] Этап 2: `nginx -t` перед любым reload
- [ ] Этап 2: проверка `docker ps` других проектов после каждого действия
- [ ] Этап 3: nginx reload только если `nginx -t` = OK
- [ ] Этап 5: старый VPS1 остановлен только **после** успешного DNS cutover
- [ ] Rollback plan готов и путь к бакапу сохранён

---

## Особенности для агентного выполнения

1. **Подтверждение перед критичными шагами:**
   - Перед `nginx reload`
   - Перед `docker compose up`
   - Перед остановкой VPS1

2. **Автоматические проверки после каждого действия:**
   - `nginx -t` всегда
   - `docker ps --filter name=matcheck` (чужие сайты живы)
   - `systemctl status nginx`

3. **Логирование:**
   Сохранять вывод команд в `/root/passdesk-migration.log` для отладки.

4. **Откат на ошибку:**
   При любой ошибке в Этапах 2-3 → автоматический rollback без DNS-изменений.
