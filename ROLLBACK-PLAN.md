# PassDesk Migration — Quick Rollback

## Когда откатываться

- Не проходит `nginx -t` после добавления passdesk vhost
- PassDesk на VPS2 не поднимается (контейнеры unhealthy)
- Другие сайты на VPS2 перестали отвечать после изменений
- DNS переключен, но passdesk.click не работает > 15 мин

---

## Rollback — ДО переключения DNS

**Если проблема на этапах 0-4 (контейнеры, nginx, тесты):**

### На VPS2 (selectel_main):
```bash
# 1. Остановить и удалить PassDesk контейнеры
cd /home/passdesk/portal
docker compose -p portal down
# Опционально: удалить volumes если занимают место
# docker volume rm portal_postgres_data portal_redis_data

# 2. Удалить nginx vhost
rm /etc/nginx/sites-enabled/passdesk.click
rm /etc/nginx/sites-available/passdesk.click

# 3. Проверить и перезагрузить nginx
nginx -t
systemctl reload nginx

# 4. Проверить что другие сайты живы
curl -I http://127.0.0.1:13001/  # matcheck
curl -I http://127.0.0.1:8180/   # refhub
docker ps --filter name=matcheck --filter name=refhub

# 5. Если nginx сломался — восстановить из бакапа
BACKUP=$(cat /root/.passdesk-migration-backup-path)
tar -xzf "$BACKUP/nginx/nginx-full-backup.tar.gz" -C / --overwrite
nginx -t && systemctl reload nginx
```

**DNS менять не нужно** — passdesk.click остаётся на VPS1 (185.31.165.250).

---

## Rollback — ПОСЛЕ переключения DNS

**Если проблема на этапе 5+ (уже в проде на VPS2):**

### 1. DNS (приоритет 1 — вернуть трафик)
Вернуть A-записи:
```
passdesk.click      A  185.31.165.250
www.passdesk.click  A  185.31.165.250
```
TTL: 5-15 мин до пропагации.

### 2. На VPS1 (otitb) — запустить старый PassDesk
```bash
su - passdesk -c "
  cd /home/passdesk/portal
  docker compose -p portal start
"

# Проверить
docker ps --filter name=passdesk_
curl http://127.0.0.1:5173/healthz
curl http://127.0.0.1:5003/health
```

### 3. На VPS2 (selectel_main) — остановить новый PassDesk
```bash
cd /home/passdesk/portal
docker compose -p portal down

# Удалить nginx vhost (чтобы не конфликтовал если DNS вернётся случайно)
rm /etc/nginx/sites-enabled/passdesk.click
certbot delete --cert-name passdesk.click  # удалить LE сертификат если получили
nginx -t && systemctl reload nginx
```

### 4. GitHub Actions
Вернуть в секретах:
- `SSH_HOST` → `185.31.165.250`
- Путь в workflow → `/home/passdesk/portal` (или оставить как есть если он уже правильный)

---

## Восстановление nginx из полного бакапа (если всё сломалось)

**Используется только если nginx на VPS2 полностью неработоспособен:**

```bash
# Остановить nginx
systemctl stop nginx

# Восстановить конфиги из архива
BACKUP=$(cat /root/.passdesk-migration-backup-path)
tar -xzf "$BACKUP/nginx/nginx-full-backup.tar.gz" -C / --overwrite

# Проверить
nginx -t

# Если OK — запустить
systemctl start nginx

# Проверить другие сайты
curl -I -H "Host: mat.su10.ru" http://localhost/
curl -I -H "Host: refhub.su10.ru" http://localhost/
```

---

## Проверка после rollback

### VPS1 (должен снова работать):
```bash
curl -I https://passdesk.click/
# Должен вернуть 200 с VPS1
```

### VPS2 (другие сайты не пострадали):
```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'matcheck|refhub|hubtender'
# Все Up/healthy

curl -I https://mat.su10.ru/
curl -I https://refhub.su10.ru/
curl -I https://tender.su10.ru/
# Все 200
```

---

## Контакты бакапа

Путь к бакапу VPS2:
```bash
cat /root/.passdesk-migration-backup-path
# Например: /root/backups/passdesk-migration-20260715-182300
```

Содержимое:
- `nginx/nginx-full-backup.tar.gz` — полный конфиг nginx
- `nginx/sites-enabled-before.txt` — список vhosts до изменений
- `docker/containers-before.txt` — состояние контейнеров
- `system/listen-ports-before.txt` — занятые порты

**Хранить минимум 7 дней** после успешной миграции.
