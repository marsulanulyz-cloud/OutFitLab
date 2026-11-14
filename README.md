# Stylist — ИИ-стилист и цифровой гардероб

Загружаете фото одежды → ИИ убирает фон и размечает вещь → стилист собирает 3 образа под повод, вайб и погоду.
Плюс: «умная докупка», оценка образа по селфи, «забытые вещи», статус «в стирке».

```
db/schema.sql      PostgreSQL-схема
backend/           FastAPI + asyncpg, Gemini, rembg
frontend/          Next.js 15 (App Router) + Tailwind + SWR
docker-compose*.yml, Caddyfile, scripts/backup.sh
```

## 1. Ключи и аккаунты
| Что | Где взять | Куда вписать |
|---|---|---|
| Gemini API key | Google AI Studio | `backend/.env` → `GEMINI_API_KEY` |
| Google Sign-In | Google Cloud Console → OAuth Client ID (Web). В *Authorized JavaScript origins* добавьте `http://localhost:3000` и адрес сайта | `GOOGLE_CLIENT_ID` (бэкенд) и `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (фронтенд) |
| Sign in with Apple (необязательно) | Apple Developer (платный аккаунт): Services ID, домен сайта и Return URL (= адрес сайта, только HTTPS) | `APPLE_CLIENT_ID` / `NEXT_PUBLIC_APPLE_CLIENT_ID`. Пусто — кнопки Apple не будет |
| JWT-секрет | `openssl rand -hex 32` | `backend/.env` → `JWT_SECRET` |

## 2. Локальная разработка
```bash
# бэкенд + БД
cp backend/.env.example backend/.env      # заполнить
docker compose up --build                 # API: http://localhost:8000/docs

# фронтенд (в другом терминале; нужен Node 20+)
cd frontend
cp .env.example .env.local                # вписать NEXT_PUBLIC_GOOGLE_CLIENT_ID
npm install
npm run dev                               # http://localhost:3000
```
`CORS_ORIGINS` в `backend/.env` должен содержать `http://localhost:3000`.

## 3. Публикация на VPS (≥ 2 ГБ RAM, Docker)
1. Две A-записи на IP сервера: `stylist.example.com` и `api.stylist.example.com`.
2. `cp .env.example .env` и заполнить (домены, `POSTGRES_PASSWORD`, `GOOGLE_CLIENT_ID`).
3. В `backend/.env`:
   - `PUBLIC_BASE_URL=https://api.stylist.example.com`
   - `CORS_ORIGINS=["https://stylist.example.com"]`
4. `docker compose -f docker-compose.prod.yml up -d --build` — Caddy сам выпустит HTTPS-сертификаты.
5. В Google Console добавьте `https://stylist.example.com` в Authorized JavaScript origins.
6. Бэкапы: `crontab -e` → `30 3 * * * /путь/к/stylist-ai/scripts/backup.sh`.

Обновление: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.
Схема БД применяется только на пустом томе; для будущих изменений схемы заведите миграции (Alembic).

## 4. Как устроена авторизация
Access-токен (15 мин) хранится в памяти страницы. Refresh-токен (30 дней) — только в httpOnly-cookie,
которую выставляет Next.js (`/api/session/*`); JS его не видит. Refresh ротируется при каждом обновлении,
повторное использование старого токена гасит всю цепочку сессий.

## 5. Ограничения MVP
- Лимиты запросов хранятся в памяти процесса (один воркер). Для нескольких воркеров — Redis.
- Фото лежат на диске сервера (том `uploads`). Для роста — S3/R2.
- Гардероб в интерфейсе грузится первыми 100 вещами (лимит API на страницу).
- Один и тот же человек через Google и Apple получит два аккаунта (связывание не реализовано).
- Тесты не написаны; код не проверялся на реальных ключах.
