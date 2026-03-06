# login-service.dashdesign.eu

Central auth service for **dashdesign; Konto**.

## Current scope (phase 1)
- Health endpoint
- Auth provider starter endpoints (email/google/apple)
- OAuth callback placeholders
- Onboarding profile endpoint scaffold
- Local JSON data persistence

## Endpoints
- `GET /health`
- `POST /auth/email/login`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /auth/apple/start`
- `GET /auth/apple/callback`
- `POST /onboarding/profile`

## Data storage
Service stores data in:
- **Container path:** `/data/login-service.json`
- **With docker-compose:** mapped to host `./data/login-service.json`

Stored objects:
- users
- onboarding profiles
- (reserved) analytics events

## Run (node)
```bash
npm install
npm run dev
```

## Run (docker)
```bash
cp .env.example .env
# set secrets in .env

docker compose up -d --build
curl http://localhost:8080/health
```
