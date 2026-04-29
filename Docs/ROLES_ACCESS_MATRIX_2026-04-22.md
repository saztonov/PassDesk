# Матрица доступа PassDesk: роли × страницы UI

Дата актуализации: 2026-04-22

## Роли

| Код | Назначение |
|-----|-----------|
| admin | Администратор системы |
| manager | Руководитель бюро пропусков |
| user | Оператор / сотрудник контрагента (доступ ограничен по контрагенту) |
| laborer | Рабочий с мобильным кабинетом |
| ot_admin | Администратор модуля «Охрана труда» |
| ot_engineer | Инженер ОТ |

## Условные обозначения

- **M** — пункт виден в **десктопном** боковом меню (`Sidebar`)
- **m** — пункт виден в **мобильном** меню (`MobileDrawerMenu`)
- **R** — страница доступна по прямой ссылке (`ProtectedRoute.allowedRoles`)
- **—** — нет доступа

## Матрица страниц

| Страница | Путь | admin | manager | user | laborer | ot_admin | ot_engineer |
|----------|------|:-----:|:-------:|:----:|:-------:|:--------:|:-----------:|
| Сотрудники | `/employees` | M m R | M m R | M m R¹ | — | — | — |
| Охрана труда | `/ot` | M m R | — | m R¹ ² | — | M m R | M m R |
| Справочники | `/directories` | M m R | M m R | — | — | **M m R** | — |
| Администрирование | `/administration`, `/admin` | M m R | M m R | — | — | — | — |
| СКУД | `/skud`, `/skud/employee-events` | R³ | — | — | — | — | — |
| Пропуска (редирект) | `/passes` → `/skud` | R | — | — | — | — | — |
| Контрагенты (юзер-вид) | `/counterparties` | R | R | M m R¹ ⁴ | — | — | — |
| Документы контрагента | `/counterparty-documents` | R | R | R¹ | — | — | — |
| Заявка на пропуска | `/employees/request` | R | R | R¹ | — | — | — |
| QR-доступ (быстрый QR) | `/qr-access` | M⁵ R | M⁵ R | — | — | — | — |
| Кабинет рабочего | `/cabinet` | — | — | — | M m R | — | — |
| Профиль | `/profile`, `/my-profile` | m R | m R | m R | m R (`/cabinet`) | m R | m R |
| Вход / блокировка | `/login`, `/blocked` | public | public | public | public | public | public |
| Debug | `/debug`, `/employees/debug/*` | R⁶ | R⁶ | — | — | — | — |

**Примечания:**
1. `user` видит пункт в меню, но данные внутри ограничены его контрагентом / персональными привязками (см. `checkEmployeeAccess` в `server/src/utils/permissionUtils.js`).
2. Пункт «ОТ» для `user` появляется через `canAccessOt()` — зависит от того, привязан ли пользователь к default-контрагенту.
3. Пункт СКУД скрыт флагом `SHOW_SKUD_SIDE_MENU_ITEM = false` в `Sidebar.jsx` — доступ только по прямой ссылке.
4. `user` видит «Контрагенты» в меню только если он **не из default-контрагента** (`showCounterpartiesMenu`).
5. `/qr-access` доступен при включённом `VITE_MOBILE_ACCESS_ENABLED`.
6. Только в dev-сборке (`import.meta.env.DEV`).

## Вкладки страницы `/directories`

Все ключи: `counterparties`, `construction-sites`, `departments`, `positions`.
Скрыты в UI (`HIDDEN_DIRECTORY_TAB_KEYS`): `departments`, `positions`.

| Вкладка | admin | manager | ot_admin |
|---------|:-----:|:-------:|:--------:|
| Контрагенты | ✓ | ✓ | ✓ |
| Объекты строительства | ✓ | ✓ | — |
| Подразделения (скрыто в UI) | hidden | hidden | hidden |
| Должности (скрыто в UI) | hidden | hidden | hidden |

## Вкладки страницы `/administration` (десктоп)

| Вкладка | admin | manager |
|---------|:-----:|:-------:|
| Пользователи | ✓ | — |
| Контрагенты | ✓ | ✓ |
| Гражданство | ✓ | ✓ |
| Журнал изменений | ✓ | ✓ |
| Корзина | ✓ | ✓ |
| OCR расхождения | ✓ | ✓ |
| OCR промпты | ✓ | — |
| Образцы документов | ✓ | — |
| Настройки | ✓ | — |

## Вкладки страницы `/administration` (мобильный рендер)

| Вкладка | admin | manager |
|---------|:-----:|:-------:|
| Пользователи | ✓ | — |
| Контрагенты | ✓ | ✓ |
| Журнал | ✓ | ✓ |

## Источники истины

- Десктопное меню: `client/src/components/Layout/Sidebar.jsx`
- Мобильное меню: `client/src/components/Layout/MobileDrawerMenu.jsx`
- Роуты и guards: `client/src/App.jsx`, `client/src/components/Auth/ProtectedRoute.jsx`
- Состав вкладок: `client/src/pages/DirectoriesPage.jsx`, `client/src/pages/AdministrationPage.jsx`
- Доменные ограничения по контрагентам: `server/src/utils/permissionUtils.js`
