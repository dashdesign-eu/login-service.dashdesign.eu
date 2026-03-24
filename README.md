# login-service.dashdesign.eu

Central auth service for **dashdesign**.

## Portal
- `GET /login` → portal login UI (email + Google/Apple actions)
- `GET /account` → account page (shows current user data from token)

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

## Auth/session endpoints
- `GET /auth/me` (Bearer access token) → DB-backed user + effective roles
- `GET /auth/session` (Bearer access token) → decoded claims
- `POST /auth/login`
- `POST /auth/refresh`

## Redirect login flow (reusable for apps)
1. App opens: `GET /auth/redirect/start?returnTo=<APP_CALLBACK_URL>`
2. User logs in on portal (`/login`), then service redirects to `returnTo?callbackToken=...`
3. App backend exchanges token:
   - `POST /auth/redirect/exchange`
   - body: `{ "callbackToken": "...", "returnTo": "..." }`
   - returns `{ token, refreshToken, payload }`

Security:
- one-time callback token, short TTL
- returnTo must pass `REDIRECT_ALLOWED_ORIGINS`

## Existing core endpoints
- `POST /auth/email/register/start`
- `POST /auth/email/register/verify`
- `GET /health`

## Run
```bash
npm install
npm run dev
```

## Coolify / Docker Compose
The repo includes a self-contained `docker-compose.yml` with an internal Postgres service.
That means Coolify can deploy it without an external database service.

Recommended Coolify envs:

```env
PORT=8080
APP_BASE_URL=https://login-service.dashdesign.eu
POSTGRES_DB=login_service
POSTGRES_USER=login_service
POSTGRES_PASSWORD=<strong-random-password>
JWT_ACCESS_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<strong-random-secret>
REDIRECT_ALLOWED_ORIGINS=https://laraleyla-monitor.diestadt.app,https://laraleyla-monitor.pages.dev
ALLOW_INSECURE_REDIRECTS=false
TRUST_PROXY=1
CORS_ALLOWLIST=https://login-service.dashdesign.eu
MONITOR_VIEWER_EMAILS=
MONITOR_EDITOR_EMAILS=
MONITOR_ADMIN_EMAILS=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://login-service.dashdesign.eu/auth/google/callback
APPLE_TEAM_ID=
APPLE_CLIENT_ID=eu.dashdesign.loginservice
APPLE_KEY_ID=
APPLE_PRIVATE_KEY_PATH=./secrets/AuthKey.p8
APPLE_REDIRECT_URI=https://login-service.dashdesign.eu/auth/apple/callback
```

Coolify note:
- assign the domain as `https://login-service.dashdesign.eu:8080`
- the `:8080` tells Coolify the internal container port; externally the site is still served on normal HTTPS
- Postgres stays private inside the compose network

If Google/Apple auth is not needed immediately, those provider envs can stay empty; email/redirect flow will still work.

## CSP note (important)
The login and account pages use external scripts from `/static/*.js` to stay compatible with Helmet's default CSP (`script-src 'self'`).
If you reintroduce inline `<script>`, the browser will block it unless you configure nonces/hashes or `unsafe-inline`.
