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

## Лицензия

Private
