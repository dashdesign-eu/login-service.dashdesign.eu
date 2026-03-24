# Cross-project Login Architecture

Diese Doku ist das verbindliche Zielbild für den dashdesign-Login rund um:
- `login-service.dashdesign.eu`
- `laraleyla_monitor_new`
- `lara-news-generator.herold.news`
- optional `login.dashdesign.eu` als statische Einstiegsseite

## Kurzfassung

- **Der Login wird immer vom Frontend des Zielprodukts gestartet**, aber **nicht** durch direkte Token-Verarbeitung im Browser.
- **Die Login-URL wird vom Ziel-Backend gebaut**, nicht vom Frontend.
- **Die verbindliche Return-URL ist immer die Callback-URL des Ziel-Frontends**.
- **Der `callbackToken` wird immer vom Ziel-Backend gegen den Login-Service eingetauscht**.
- **Das produkt-spezifische Session-/Access-Cookie wird immer auf dem Ziel-Backend-Host gesetzt**.
- **`/auth/me` wird immer auf dem Ziel-Backend-Host gelesen**.
- **Relative API-Aufrufe sind nur innerhalb desselben Hosts sinnvoll**; cross-origin braucht immer den expliziten API-/Backend-Host.

---

## Beteiligte Rollen

### 1) Login-Service (`login-service.dashdesign.eu`)
Aufgaben:
- zentrale Benutzeranmeldung
- Ausgabe von Access-/Refresh-Tokens
- Erzeugung kurzlebiger Einmal-`callbackToken`s für Redirect-Logins
- Validierung erlaubter `returnTo`-Origins

Der Login-Service **setzt keine Produkt-Cookies für LaraLeyla Monitor**. Er gibt nur Token aus.

### 2) Produkt-Backend (`lara-news-generator.herold.news` / Monitor API)
Aufgaben:
- baut die produktspezifische `loginUrl`
- kennt die **verbindliche** `returnTo`
- tauscht `callbackToken` serverseitig ein
- validiert Rollen
- setzt das Produkt-Cookie (`monitor_access_token`)
- beantwortet `GET /monitor/api/auth/me`

### 3) Produkt-Frontend (`laraleyla_monitor_new`)
Aufgaben:
- startet den Flow über das Produkt-Backend
- verarbeitet den Redirect auf der Frontend-Callback-Route
- ruft danach das Produkt-Backend auf, damit dort das Cookie gesetzt wird
- liest Sessionstatus ausschließlich über das Produkt-Backend

### 4) Statisches Login-Portal (`login.dashdesign.eu`)
Optionaler Komfort-Einstiegspunkt.

Wichtig:
- `login.dashdesign.eu` ist **nicht** der technische Kern des Flows.
- Es darf informative Links anbieten.
- Produktlogins dürfen sich **nicht** darauf verlassen, dass dieses Portal die korrekte `returnTo` kennt.

---

## Verbindlicher Redirect-Flow

### Schritt 1: Frontend startet den Login
Beispiel LaraLeyla Monitor:
- Frontend ruft `GET /monitor/api/auth/redirect/start` auf dem **Monitor-Backend** auf.

Warum so?
- Das Frontend soll **nicht** selbst Host- oder `returnTo`-Logik zusammenbauen.
- Das Backend ist die Quelle der Wahrheit für Login-Service-Host und Callback-URL.

### Schritt 2: Produkt-Backend baut die Login-URL
Das Produkt-Backend erzeugt:
- `loginUrl = https://login-service.dashdesign.eu/auth/redirect/start?returnTo=<MONITOR_LOGIN_RETURN_TO_URL>`

Dabei gilt:
- `returnTo` ist die fest konfigurierte Callback-URL des Produkts.
- Diese URL muss im Login-Service über `REDIRECT_ALLOWED_ORIGINS` erlaubt sein.

### Schritt 3: Browser navigiert zum Login-Service
Das Frontend navigiert den **aktuellen Tab** auf `loginUrl`.

Warum gleicher Tab?
- Der Login-Service leitet anschließend direkt zurück auf die Produkt-Callback-URL.
- So landet der Nutzer ohne Hilfsklicks wieder im Produkt.
- Ein neuer Tab erzeugt eher Doppelzustände und macht den Flow unnötig sperrig.

### Schritt 4: Login-Service authentifiziert den Nutzer
Im Login-Service:
- Nutzer meldet sich an
- bei Redirect-Login wird **kein Produkt-Cookie** gesetzt
- stattdessen erzeugt der Login-Service einen **kurzlebigen Einmal-`callbackToken`**
- Redirect auf:
  - `<returnTo>?callbackToken=...`

### Schritt 5: Frontend-Callback ruft Produkt-Backend auf
Das Produkt-Frontend landet auf z. B.:
- `https://laraleyla-monitor.diestadt.app/auth/callback?callbackToken=...`

Dann ruft das Frontend auf:
- `GET https://laraleyla-main-service.diestadt.app/monitor/api/auth/redirect/callback?callbackToken=...`

Wichtig:
- Der Austausch gegen echte Tokens passiert **nicht im Browser direkt gegen den Login-Service**.
- Er passiert **nur über das Produkt-Backend**.

### Schritt 6: Produkt-Backend tauscht `callbackToken` ein
Das Produkt-Backend ruft serverseitig auf:
- `POST https://login-service.dashdesign.eu/auth/redirect/exchange`
- body:
  - `callbackToken`
  - `returnTo` = exakt dieselbe konfigurierte Produkt-Callback-URL

Der Login-Service prüft:
- Token existiert
- Token nicht konsumiert
- Token nicht abgelaufen
- `returnTo` stimmt exakt überein

Danach liefert der Login-Service:
- Access-Token
- Refresh-Token
- Payload/Userdaten

### Schritt 7: Produkt-Backend setzt Cookie
Das Produkt-Backend setzt sein eigenes Cookie, aktuell:
- `monitor_access_token`

Dieses Cookie gehört zum Host des Produkt-Backends und wird dort für weitere API-Calls verwendet.

### Schritt 8: Frontend liest Session über Produkt-Backend
Danach ruft das Frontend auf:
- `GET /monitor/api/auth/me` auf dem **Produkt-Backend-Host**

Nicht auf dem Login-Service.

Der Login-Service ist die Identitätsquelle, aber **nicht** die laufende Session-API für das Produkt.

---

## Verbindliche Antworten auf die Kernfragen

### Wer startet den Login?
- Das **Produkt-Frontend** startet ihn durch Aufruf des **Produkt-Backends**.
- Das Produkt-Backend gibt die fertige `loginUrl` zurück.

### Welcher Host baut die `loginUrl`?
- Immer das **Produkt-Backend**.
- Im aktuellen Setup: `lara-news-generator.herold.news` / Monitor-API.

### Welche Return-URL ist verbindlich?
- Immer die im Produkt-Backend konfigurierte Callback-URL.
- Für Monitor aktuell: `MONITOR_LOGIN_RETURN_TO_URL`
- Beispiel: `https://laraleyla-monitor.diestadt.app/auth/callback`

### Wer tauscht `callbackToken` ein?
- Immer das **Produkt-Backend**.
- Nie das Frontend direkt.

### Wo wird das Session-/Access-Cookie gesetzt?
- Immer auf dem **Produkt-Backend-Host**.
- Aktuell: `monitor_access_token` im Monitor-Backend.

### Auf welchem Host wird `auth/me` gelesen?
- Immer auf dem **Produkt-Backend-Host**.
- Aktuell: `GET /monitor/api/auth/me` auf `laraleyla-main-service.diestadt.app`

### Welche CORS-/Cookie-/SameSite-/Domain-Annahmen gelten?
- Browser → Produkt-Backend ist cross-origin und braucht `withCredentials: true`.
- Produkt-Backend muss `credentials: true` erlauben und den Frontend-Origin in der Allowlist haben.
- Produkt-Cookie ist `httpOnly`, `secure` (in Produktion), `sameSite=lax`, `path=/`.
- Das Cookie ist **hostgebunden**, solange keine `domain` gesetzt wird.
- Deshalb muss das Frontend seine Session immer über genau diesen Backend-Host ansprechen.

### Wo darf relative API-Nutzung passieren, wo muss absolute Host-Nutzung rein?
- **Relativ** nur, wenn Frontend und API wirklich denselben Host teilen.
- **Absolut** immer dann, wenn das Frontend auf einer anderen Origin läuft als das Backend.
- Im aktuellen Monitor-Setup muss das Frontend absolute Backend-URLs verwenden.
- Innerhalb des Login-Service selbst sind relative Aufrufe für eigene Seiten/API-Endpunkte okay.

### Wie sollen neue Frontends/APIs künftig korrekt andocken?
1. Neues Produkt bekommt ein eigenes Backend.
2. Backend definiert feste `LOGIN_SERVICE_URL` und feste `LOGIN_RETURN_TO_URL`.
3. Backend bietet drei Endpunkte:
   - `/auth/redirect/start`
   - `/auth/redirect/callback`
   - `/auth/me`
4. Frontend startet nur `/auth/redirect/start`.
5. Backend tauscht `callbackToken` ein.
6. Backend setzt eigenes Produkt-Cookie.
7. Frontend liest Session nur über `/auth/me` des Produkt-Backends.

---

## Soll/Ist je Projekt

### `login-service.dashdesign.eu`
**Soll**
- zentrale Auth
- Redirect-Tokens
- Token-Exchange
- keine produktspezifischen Cookies

**Ist**
- erfüllt diesen Zweck bereits
- `safeReturnTo()` + `REDIRECT_ALLOWED_ORIGINS` sichern den Redirect-Flow ab
- `/auth/redirect/start`, `/auth/redirect/complete`, `/auth/redirect/exchange` sind vorhanden

### `lara-news-generator.herold.news`
**Soll**
- Monitor-Backend für Login-Start, Callback-Exchange, Cookie-Session, `/auth/me`

**Ist**
- erfüllt diesen Zweck bereits
- setzt `monitor_access_token`
- prüft Rollen lokal über JWT
- bedient `/monitor/api/auth/me`

**Offene Aufräumarbeit**
- veraltete Konfiguration `MONITOR_LOGIN_PORTAL_URL` ist missverständlich und wird nicht genutzt

### `laraleyla_monitor_new`
**Soll**
- startet Login über Backend
- navigiert in denselben Tab
- tauscht `callbackToken` nie direkt selbst beim Login-Service ein
- liest Session nur per Backend-`/auth/me`

**Ist**
- fast korrekt
- Start über Backend ist korrekt
- Callback geht korrekt ans Backend
- Sessionabruf geht korrekt ans Backend
- Abweichung: Login wurde im **neuen Tab** gestartet statt im aktuellen Tab

### `login.dashdesign.eu`
**Soll**
- optionale statische Landingpage
- keine technische Abhängigkeit für den Produkt-Flow

**Ist**
- erfüllt genau diese Rolle
- technisch nicht am produktiven Redirect-Flow beteiligt

---

## Konkrete Betriebsregeln

- `REDIRECT_ALLOWED_ORIGINS` im Login-Service muss alle erlaubten Frontend-Callback-Origins enthalten.
- `MONITOR_LOGIN_RETURN_TO_URL` muss exakt zu einer erlaubten Origin gehören.
- Monitor-Frontend darf **keine** Login-Service-Tokens in `localStorage` speichern.
- Produkt-Backends dürfen Access-Tokens als `httpOnly`-Cookie kapseln.
- Wenn ein Produkt später Refresh serverseitig nutzen soll, gehört auch das in das Produkt-Backend und nicht in das Frontend.

## Testmatrix

### Minimaltest Redirect-Flow
1. Frontend ruft Produkt-Backend `/auth/redirect/start` auf.
2. Produkt-Backend liefert Login-Service-URL mit korrektem `returnTo`.
3. Login-Service akzeptiert `returnTo`.
4. Nach Login Redirect auf Produkt-Callback mit `callbackToken`.
5. Produkt-Backend tauscht Token erfolgreich ein.
6. Produkt-Backend setzt Cookie.
7. `/auth/me` liefert Benutzerdaten.

### Negativtests
- ungültige `returnTo` → `invalid_return_to`
- abgelaufener `callbackToken` → `callback_expired`
- zweiter Austausch desselben Tokens → `callback_consumed`
- Rollen fehlen → `403 forbidden`

## Entscheidungsregel für künftige Änderungen

Wenn eine Änderung dazu führt, dass ein Browser direkt mit Login-Service-Tokens hantieren muss, ist sie im Regelfall architektonisch falsch. Das Produkt-Backend ist die Trennschicht zwischen zentraler Identität und produktspezifischer Session.