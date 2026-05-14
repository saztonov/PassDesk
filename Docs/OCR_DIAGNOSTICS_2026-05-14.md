# Диагностика OCR на проде: сбор логов через putty

Дата актуализации: 2026-05-14

Документ — для случаев «коллеги жалуются: загрузили документ, поля не заполнились». Содержит готовые команды для подключения к проду по putty и сбора логов OCR в файл, который потом можно отдать LLM-ассистенту.

## 1. Подключение

В putty:
- Host: `otitb` (или IP VPS)
- User: `root`

После входа:
```bash
su - passdesk
cd ~/portal
```

Контейнер бэкенда — `passdesk_server` (см. [VPS_DEPLOYMENT_2026-04-29.md](VPS_DEPLOYMENT_2026-04-29.md)). Все OCR-сообщения сервер пишет в stdout с префиксом `[ocr]` — поэтому достаточно `docker logs`.

## 2. Быстрый просмотр (что произошло прямо сейчас)

```bash
# последние 500 строк лога сервера, только OCR
docker logs --tail=500 passdesk_server 2>&1 | grep -i "\[ocr\]"

# в реальном времени (Ctrl+C для выхода) — удобно, пока коллега грузит документ
docker logs -f --tail=50 passdesk_server 2>&1 | grep -i "\[ocr\]"
```

## 3. Целевые маркеры (что искать)

| Маркер в логе | Что это значит | Чем чинится |
|---|---|---|
| `[ocr] empty provider response` | OpenRouter вернул пустой content. Обычно — плохое фото (засветы, blur). | Переснять документ при хорошем освещении. |
| `[ocr] no structured fields extracted` | JSON распарсился, но все поля пустые/null. Модель «увидела» документ, но не смогла прочитать поля. | То же — качество фото. Иногда — попробовать другой тип документа в форме. |
| `[ocr] provider request failed` | OpenRouter недоступен / 5xx / таймаут. | Подождать; проверить ключ `OCR_API_KEY` и квоту OpenRouter. |
| `[ocr] identifier fallback failed` | Не получилось добрать ИНН/СНИЛС вторым запросом. | Не критично, основной результат обычно есть. |
| `[ocr] decrypt failed` | Файл зашифрован, расшифровка упала. | Очень редко — проверять `APP_FILE_ENCRYPTION_KEYS`. |
| `axios timeout` / `ETIMEDOUT` рядом с `[ocr]` | Провайдер не уложился в `OCR_REQUEST_TIMEOUT_MS` (60000 мс). | Слишком большой PDF; переслать как JPG первой страницы. |

```bash
# найти все «плохие» события за последние сутки
docker logs --since=24h passdesk_server 2>&1 \
  | grep -E "\[ocr\] (empty provider response|no structured fields extracted|provider request failed|identifier fallback failed|decrypt failed)"
```

## 4. Сбор файла для отправки LLM

```bash
# OCR-события за последние 6 часов, с контекстом ±3 строки
docker logs --since=6h passdesk_server 2>&1 \
  | grep -E -B3 -A3 -i "\[ocr\]|ocr\.controller|recognizeDocument" \
  > /tmp/passdesk-ocr.log

# посмотреть размер и первые строки
ls -lh /tmp/passdesk-ocr.log
head -30 /tmp/passdesk-ocr.log
```

Скачать на свою машину (Windows, через PSCP — идёт в комплекте с putty):
```cmd
pscp passdesk@otitb:/tmp/passdesk-ocr.log .
```
Или через WinSCP, если он используется. Файл затем приложить к запросу к LLM.

## 5. Дополнительные команды

```bash
# Состояние контейнеров
docker compose -f ~/portal/docker-compose.prod.yml ps

# Сервер не падал и принимает запросы?
docker exec passdesk_server sh -c 'wget -qO- http://127.0.0.1:5000/health'

# Сколько памяти / CPU ест сервер прямо сейчас
docker stats --no-stream passdesk_server

# Лог только за конкретный временной интервал (UTC)
docker logs --since="2026-05-14T08:00:00" --until="2026-05-14T10:00:00" passdesk_server 2>&1 \
  | grep -i "\[ocr\]"

# Поиск по конкретному employeeId / fileId (если коллега назвал)
docker logs --since=24h passdesk_server 2>&1 \
  | grep -E "<EMPLOYEE_ID>|<FILE_ID>"
```

## 6. Что нельзя делать

- ~~Делать `docker logs passdesk_server` без `--tail` или `--since`~~ — выдаст весь лог от старта контейнера, putty повиснет.
- ~~Использовать `psql` напрямую с VPS под `passdesk`~~ — psql-клиент на хосте не установлен, БД внешняя. Если нужно посмотреть `employee_ocr_conflicts` — это делается из админки приложения или из локальной машины со своим psql.
- ~~Применять миграции вручную~~ — они идут сами при `git pull` + пересборке (см. [VPS_DEPLOYMENT_2026-04-29.md](VPS_DEPLOYMENT_2026-04-29.md)).

## 7. Шаблон обращения к LLM

> «Жалоба: <имя коллеги> загрузил документ <тип> для сотрудника <ID>, поля <какие> не заполнились. Прикладываю `passdesk-ocr.log` за последние 6 часов. Что произошло и как починить?»

LLM сопоставит маркеры в логе с таблицей из раздела 3 и даст диагноз.
