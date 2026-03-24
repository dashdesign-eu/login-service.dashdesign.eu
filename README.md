# login-service.dashdesign.eu

Central auth service for **dashdesign**.

## What this service is responsible for

- authenticating dashdesign users
- issuing access and refresh tokens
- handling reusable redirect-login flows for external products
- validating allowed redirect targets via `REDIRECT_ALLOWED_ORIGINS`

What it is **not** responsible for:
- setting product-specific session cookies for other apps
- serving as the ongoing `/auth/me` API for external products

The canonical cross-project architecture is documented in:
- `docs/cross-project-login-architecture.md`

## Portal
- `GET /login` → portal login UI (email + Google/Apple actions)
- `GET /account` → local account page (reads bearer token from localStorage for the login-service UI itself)

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

## Redirect login flow for external apps

This is the reusable flow used by LaraLeyla Monitor.

1. **Product frontend** calls its **own backend**:
   - example: `GET /monitor/api/auth/redirect/start`
2. **Product backend** builds the login URL:
   - `GET https://login-service.dashdesign.eu/auth/redirect/start?returnTo=<PRODUCT_CALLBACK_URL>`
3. User logs in on `/login`
4. Login-service redirects to:
   - `<PRODUCT_CALLBACK_URL>?callbackToken=...`
5. **Product frontend** forwards that callback token to its **own backend**
6. **Product backend** exchanges it with:
   - `POST /auth/redirect/exchange`
   - body: `{ "callbackToken": "...", "returnTo": "..." }`
7. **Product backend** sets its own cookie/session
8. Product frontend reads current user from the **product backend** (`/auth/me` there), not from this service

### Why this separation exists
- The login-service is the central identity provider.
- Each product backend owns its own browser session/cookie.
- Frontends should not directly exchange redirect tokens against the login-service.

### Security properties
- one-time callback token
- short callback token TTL
- exact `returnTo` match during exchange
- redirect target must pass `REDIRECT_ALLOWED_ORIGINS`

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
