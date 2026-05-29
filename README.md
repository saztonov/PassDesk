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
| `OCR_OPENROUTER_ENDPOINT` | `https://proxy.example.com/api/v1/chat/completions` — URL прокси, OpenAI-совместимый. |
| `OCR_API_KEY` | `PROXY_INBOUND_TOKEN`. **НЕ ключ OpenRouter** — токен прокси. |
| `OCR_IDEMPOTENCY_VERSION` | `v2` рекомендуется (после фикса формулы ключа, см. ниже). Поднимать до `v3`, `v4` и т. д. при изменении промпта или схемы распознавания, чтобы старые `X-Idempotency-Key` не конфликтовали с новой логикой. |

### Переменные, которые формально остаются, но фактически игнорируются прокси

- `OCR_OPENROUTER_MODEL` / `OCR_MODEL` — прокси сам выбирает модель.
- `OCR_FALLBACK_MODEL` / `OCR_OPENROUTER_FALLBACK_MODEL` — то же.
- `OCR_SCAN_MODELS` — то же.

Эти переменные оставлены в коде ради обратной совместимости (`getOcrConfig()` всё ещё их читает), но прокси перезапишет поле `model` в payload на своё значение.

### Что прокси молча удаляет из payload

Если в исходящем запросе оказались поля `provider`, `route`, `transforms`, `plugins`, `stream`, `stream_options`, `debug` — прокси их вырезает централизованно. PassDesk эти поля не передаёт.

### Служебные заголовки, которые добавляет PassDesk

- `X-Request-Id` — UUID, уникальный для каждой HTTP-попытки (включая внутренние fallback в `recognizeDocument` и scan-цепочку). Используется для трассировки на прокси.
- `X-Idempotency-Key` — `sha256(fileId : documentType : sha256(prompt)[:16] : i:sha256(imageDataUrl)[:16] : OCR_IDEMPOTENCY_VERSION)`. Стабилен между ретраями BullMQ одной OCR-задачи, различается между задачами и между разными изображениями (даже при `fileId=null` или коллизии fileId). На прокси можно дедуплицировать повторные запросы.

### Удалить из старого `.env`

`OCR_OPENROUTER_API_KEY` и любые алиасы прямого ключа OpenRouter — больше не нужны.

## Лицензия

Private
