# login-service.dashdesign.eu

Central auth service for **dashdesign; Konto**.

## Current scope (phase 1)
- Health endpoint
- Auth provider starter endpoints (email/google/apple)
- OAuth callback placeholders
- Onboarding profile endpoint scaffold
- PostgreSQL persistence (users, onboarding, analytics events)

## Endpoints
- `GET /health`
- `POST /auth/email/login`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /auth/apple/start`
- `GET /auth/apple/callback`
- `POST /onboarding/profile`

## Data storage
Service stores data in PostgreSQL.

Tables:
- `users`
- `onboarding_profiles`
- `analytics_events`

With docker-compose, database files are persisted in:
- `./postgres-data`

## Run (node)
```bash
npm install
npm run dev
```

## Run (docker)
```bash
cp .env.example .env
# set secrets in .env (OAuth + postgres password)

docker compose up -d --build
curl http://localhost:8080/health
```
