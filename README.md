# login-service.dashdesign.eu

Central auth service for **dashdesign**.

## JWT claims format
Access token payload includes:

```json
{
  "sub": "email:user@example.com",
  "email": "user@example.com",
  "provider": "email",
  "roles": ["monitor_viewer", "monitor_editor", "admin"],
  "iss": "dashdesign-login-service",
  "aud": "dashdesign-apps"
}
```

`roles` are assigned by email allowlists from env:
- `MONITOR_VIEWER_EMAILS`
- `MONITOR_EDITOR_EMAILS`
- `MONITOR_ADMIN_EMAILS`

Role inheritance:
- `admin` ⇒ `monitor_editor` + `monitor_viewer`
- `monitor_editor` ⇒ `monitor_viewer`

## New auth/session endpoints
- `GET /auth/me` (Bearer access token) → DB-backed user + effective roles
- `GET /auth/session` (Bearer access token) → decoded claims (introspection helper)

## Existing core endpoints
- `POST /auth/email/register/start`
- `POST /auth/email/register/verify`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /health`

## Run
```bash
npm install
npm run dev
```
