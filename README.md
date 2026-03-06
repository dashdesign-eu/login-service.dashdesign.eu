# login-service.dashdesign.eu

Central auth service for **dashdesign; Konto**.

## Current scope (phase 1)
- Health endpoint
- Auth provider starter endpoints (email/google/apple)
- OAuth callback placeholders
- Onboarding profile endpoint scaffold

## Endpoints
- `GET /health`
- `POST /auth/email/login`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /auth/apple/start`
- `GET /auth/apple/callback`
- `POST /onboarding/profile`

## Run
```bash
npm install
npm run dev
```
