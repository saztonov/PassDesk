# PassDesk - Портал управления пропусками сотрудников

## Описание проектаTest
Портал для ведения базы сотрудников и управления пропусками с адаптивным дизайном для desktop и mobile устройств.

## Стек технологий

### Backend
- Node.js
- Express.js
- PostgreSQL (Yandex Managed Service)
- Yandex Object Storage (для файлов)

### Frontend
- React
- Vite
- Responsive Design (desktop, tablet, mobile)

## Структура проекта

```
PassDesk/
├── server/          # Backend (Node.js/Express)
├── client/          # Frontend (React/Vite)
├── docker-compose.yml
└── README.md
```

## Установка и запуск (локально)

### Backend
```bash
cd server
npm install
cp .env.example .env
# Настройте переменные окружения в .env
npm run dev
```

### Frontend
```bash
cd client
npm install
npm run dev
```

### Docker (опционально для локальной БД)
```bash
docker-compose up -d
```

## Развертывание на VPS

Инструкции по развертыванию на VPS будут добавлены позже.

## Переменные окружения

См. `server/.env.example` для списка необходимых переменных.

## Разработка

- Backend API: http://localhost:5000
- Frontend: http://localhost:5173
- PostgreSQL (local): localhost:5432

## OCR через прокси-сервис `proxy_llm`

PassDesk не ходит в OpenRouter напрямую. Все LLM-вызовы (распознавание документов и AI-scan) идут через VPS-сервис `proxy_llm`, который держит у себя ключ OpenRouter, контролирует выбор модели и ведёт централизованный журнал.

### Обязательные env-переменные на сервере

| Переменная | Значение |
| --- | --- |
| `OCR_OPENROUTER_ENDPOINT` | `https://proxy.example.com/api/v1/chat/completions` — URL прокси, OpenAI-совместимый. Дефолта нет: без переменной OCR падает с ошибкой конфигурации, а не уходит молча в openrouter.ai. |
| `OCR_API_KEY` | `PROXY_INBOUND_TOKEN`. **НЕ ключ OpenRouter** — токен прокси. |
| `OCR_IDEMPOTENCY_VERSION` | `v2` рекомендуется (после фикса формулы ключа, см. ниже). Поднимать до `v3`, `v4` и т. д. при изменении промпта или схемы распознавания, чтобы старые `X-Idempotency-Key` не конфликтовали с новой логикой. |
| `OCR_REQUEST_TIMEOUT_MS` | `200000`. Должен быть **больше** серверного дедлайна прокси (~190 с): иначе мы рвём связь раньше, чем прокси ответит, и выбрасываем работу, за которую уже заплатили. |

### Выбор модели: по умолчанию не выбираем

`OCR_MODEL=proxy` — это **заглушка** «модель не выбираю»: прокси подставляет дефолтную модель нашего клиента и её fallback-цепочку. Заглушками также считаются `default`, `auto` и отсутствующее/пустое значение.

**Любая другая строка — это реальный выбор модели**, и он:

- требует, чтобы оператор прокси разрешил нам выбор (`allowedModels` — список или `*`); иначе `400 model_not_allowed`;
- **отключает fallback-цепочку прокси**: недоступна модель — придёт ошибка, а не тихий переезд на резервную;
- меняет роутинг и биллинг.

Сейчас `allowedModels` для clientId PassDesk **пусто** (выбор запрещён), поэтому присланный слаг прокси игнорирует. **Не полагайтесь на это**: как только оператор включит выбор, значение `OCR_MODEL` оживёт и молча изменит роутинг. Именно поэтому дефолт — заглушка, а реальные слаги не зашиты ни в код, ни в `docker-compose*.yml`.

`OCR_SCAN_MODELS` (CSV) и `OCR_FALLBACK_MODEL` — ручки для осознанного перебора моделей **у себя**. Пустые по умолчанию: цепочку ведёт прокси. Заполнять только вместе с включённым `allowedModels`.

Откат к прежнему поведению — вернуть `OCR_MODEL=<слаг>` в `.env`, без правок кода.

### Что делать при ошибках прокси

| Код | HTTP | Что делает PassDesk |
| --- | --- | --- |
| `model_not_allowed` | 400 | Не ретраит (это конфиг, а не сбой). Список разрешённых моделей — в тексте ошибки и в логе `[ocr] provider request failed` (поле `allowedModels`). |
| `queue_full` / `dedup_full` | 503 | Прерывает перебор попыток сразу (очередь прокси от модели не зависит) и отдаёт ошибку в BullMQ, который ретраит с учётом `Retry-After`. |
| `deadline_exceeded` | 504 | Ретрай через BullMQ с тем же `X-Idempotency-Key`. |
| `streaming_not_supported` | 400 | Не воспроизводится: PassDesk не шлёт `stream`. |

Настоящие ошибки OpenRouter (429, 5xx, ошибка по ключу) прокси пробрасывает **как есть**, без обёртки `{error:{code}}` — поэтому решения принимаются по HTTP-статусу, а `code` из тела лишь уточняет диагностику.

### Что прокси молча удаляет из payload

Если в исходящем запросе оказались поля `provider`, `route`, `transforms`, `plugins`, `stream`, `stream_options`, `debug` — прокси их вырезает централизованно. PassDesk эти поля не передаёт.

### Служебные заголовки, которые добавляет PassDesk

- `X-Request-Id` — UUID, уникальный для каждой HTTP-попытки (включая внутренние fallback в `recognizeDocument` и scan-цепочку). Используется для трассировки на прокси.
- `X-Idempotency-Key` — `sha256(fileId : documentType : sha256(prompt)[:16] : i:sha256(imageDataUrl)[:16] : v:<attempt> : OCR_IDEMPOTENCY_VERSION)`. Стабилен между ретраями BullMQ одной OCR-задачи, различается между задачами и между разными изображениями (даже при `fileId=null` или коллизии fileId). Компонент `v:<attempt>` разделяет попытки внутри одного вызова (`strict-json`, `loose-json`, `identifier-fallback`, `scan:close-up`): у них разные промпты и payload, и прокси не должен схлопнуть их дедупом в один upstream-вызов.

### Что PassDesk читает из ответа прокси

- `model` в теле ответа — **фактически отработавшая** модель. При заглушке в запросе это единственный способ узнать, что выбрал прокси, поэтому в логи и в результат OCR идёт именно она, а не то, что мы просили.
- `x-proxy-request-id` — id запроса в прокси, для поиска в его журнале.
- `x-openrouter-request-id` (`gen-…`) — upstream-id для сверки с биллингом OpenRouter.

Все три пишутся в логи `[ocr] recognized` и `[ocr] provider request failed`.

### Удалить из старого `.env`

`OCR_OPENROUTER_API_KEY` и любые алиасы прямого ключа OpenRouter — больше не нужны.

## Лицензия

Private
