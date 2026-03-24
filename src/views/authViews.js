export function renderPortalHtml({ returnTo = '' } = {}) {
  const escaped = JSON.stringify(returnTo || '');
  const helperText = returnTo
    ? 'Dein Login wird direkt in die Ziel-App zurückgeleitet.'
    : 'Bitte melde dich mit deinem dashdesign; Account an.';

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>dashdesign Login</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Inter,system-ui,Arial,sans-serif;background:#0f1116;color:#fff;margin:0}
    .wrap{max-width:460px;margin:40px auto;padding:24px}
    .card{background:#171a22;border:1px solid #2a2f3d;border-radius:12px;padding:20px}
    input,button{width:100%;padding:12px;border-radius:10px;border:1px solid #363d50;background:#0f1116;color:#fff}
    button{cursor:pointer;background:#6d5efc;border:none;margin-top:10px}
    .ghost{background:#222839}
    .muted{color:#aab0c0;font-size:13px}
    .err{background:#431f24;border:1px solid #6d2d36;padding:10px;border-radius:8px;margin:10px 0}
    .status{margin-top:10px;padding:12px;border-radius:10px}
    .status-ok{border:1px solid #2b6f5a;background:#113d2e}
    .status-bad{border:1px solid #6d2d36;background:#3d1a23}
    .row{display:flex;gap:10px}
    .row > *{flex:1}
    a{color:#9bb3ff}
  </style>
</head>
<body>
  <div class="wrap">
    <h2>dashdesign Login</h2>
    <div class="card">
      <p class="muted">Melde dich mit deinem dashdesign; Account an.</p>
      <form id="f" autocomplete="on">
        <label>Benutzername</label><br/>
        <input required type="text" id="u" name="username" autocomplete="username" autocorrect="off" autocapitalize="none" spellcheck="false"/><br/><br/>
        <label>Passwort</label><br/>
        <input required type="password" id="p" name="password" autocomplete="current-password"/>
        <div id="err"></div>
        <button type="submit">Anmelden</button>
        <div id="status" class="status" style="display:none"></div>
        <div class="row">
          <button class="ghost" id="g" type="button">Google</button>
          <button class="ghost" id="a" type="button">Apple</button>
        </div>
      </form>
      <p class="muted" style="margin-top:10px">${helperText}</p>
    </div>
  </div>
<script>
const returnTo = ${escaped};
const err = (m='') => {
  const el = document.getElementById('err');
  if (!el) return;
  el.innerHTML = m ? '<div class="err">'+m+'</div>' : '';
};
const statusEl = document.getElementById('status');

const setStatus = (text, ok = false) => {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'status ' + (ok ? 'status-ok' : 'status-bad');
  statusEl.style.display = '';
};

const ERROR_TEXT = {
  invalid_credentials: 'Falsche Zugangsdaten.',
  password_not_set: 'Für dieses Konto ist kein Passwort gesetzt.',
  invalid_input: 'Bitte Benutzername und Passwort angeben.',
};

const isInternalReturnTo = (url = '') => typeof url === 'string' && url.startsWith('/');

const checkSignedIn = async () => {
  const t = localStorage.getItem('dashdesign_access_token') || '';
  if (!t) return false;
  try {
    const res = await fetch('/auth/me', { headers: { authorization: 'Bearer ' + t } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      if (res.status === 401) localStorage.removeItem('dashdesign_access_token');
      return false;
    }
    const email = data?.user?.email || 'unbekannt';
    const roles = (data?.user?.roles || []).join(', ') || 'keine';
    setStatus('Angemeldet als ' + email + ' (' + roles + ').', true);
    return data;
  } catch {
    return false;
  }
};

const continueWithSession = async () => {
  const token = localStorage.getItem('dashdesign_access_token') || '';
  if (!token || !returnTo) return false;
  if (isInternalReturnTo(returnTo)) {
    location.replace(returnTo);
    return true;
  }
  try {
    const res = await fetch('/auth/redirect/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ returnTo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data?.redirectTo) {
      if (res.status === 401) localStorage.removeItem('dashdesign_access_token');
      return false;
    }
    location.replace(data.redirectTo);
    return true;
  } catch {
    return false;
  }
};

const bootstrapSession = async () => {
  const data = await checkSignedIn();
  if (!data) return;
  if (returnTo) {
    const ok = await continueWithSession();
    if (ok) return;
    setStatus('Login-Weiterleitung ist nicht möglich. Bitte erneut anmelden.', false);
    return;
  }
  setStatus('Du bist bereits angemeldet. Weiterleitung zum Profil...', true);
  location.replace('/account');
};

const params = new URLSearchParams(window.location.search);
if (params.get('username')) {
  const pre = params.get('username');
  const input = document.getElementById('u');
  if (input) input.value = pre;
  params.delete('username');
  const nextUrl = params.toString();
  const cleanUrl = nextUrl ? '/login?' + nextUrl : '/login';
  if (window.history?.replaceState) {
    window.history.replaceState({}, '', cleanUrl);
  }
}

if (localStorage.getItem('dashdesign_access_token')) {
  bootstrapSession();
}

document.getElementById('g').onclick = () => {
  const q = returnTo ? ('?returnTo=' + encodeURIComponent(returnTo)) : '';
  location.href = '/auth/google/start' + q;
};

document.getElementById('a').onclick = () => {
  const q = returnTo ? ('?returnTo=' + encodeURIComponent(returnTo)) : '';
  location.href = '/auth/apple/start' + q;
};

document.getElementById('f').onsubmit = async (e) => {
  e.preventDefault();
  err('');
  const username = document.getElementById('u').value.trim();
  const password = document.getElementById('p').value;
  const endpoint = returnTo && !isInternalReturnTo(returnTo) ? '/auth/redirect/complete' : '/auth/login';
  const body = returnTo && !isInternalReturnTo(returnTo) ? { username, password, returnTo } : { username, password };
  const res = await fetch(endpoint, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    if (res.status === 401) localStorage.removeItem('dashdesign_access_token');
    return err(ERROR_TEXT[data?.error] || data?.error || 'Anmeldung fehlgeschlagen.');
  }

  if (returnTo) {
    if (isInternalReturnTo(returnTo)) {
      if (token) localStorage.setItem('dashdesign_access_token', token);
      location.replace(returnTo);
    } else {
      location.replace(data.redirectTo);
    }
    return;
  }

  const token = String(data.token || '').replace(/^Bearer\s+/i, '');
  if (token) localStorage.setItem('dashdesign_access_token', token);
  location.replace('/account');
};
</script>
</body>
</html>`;
}

export function renderAccountHtml() {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>dashdesign Account</title>
  <style>
    body{font-family:Inter,system-ui,Arial,sans-serif;background:#0f1116;color:#fff;margin:0}
    .wrap{max-width:760px;margin:40px auto;padding:24px}
    .card{background:#171a22;border:1px solid #2a2f3d;border-radius:12px;padding:20px}
    .muted{color:#aab0c0}
    label{display:block;margin-top:12px;margin-bottom:6px}
    input{width:100%;padding:10px;border-radius:8px;border:1px solid #363d50;background:#0f1116;color:#fff}
    button{padding:10px 14px;border-radius:8px;border:none;background:#6d5efc;color:#fff;cursor:pointer}
    .ghost{background:#2f3650}
    .status{margin-top:10px;padding:12px;border-radius:10px}
    .status-ok{border:1px solid #2b6f5a;background:#113d2e}
    .status-bad{border:1px solid #6d2d36;background:#3d1a23}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .grid-1{grid-column:1/-1}
    pre{white-space:pre-wrap;background:#0f1116;border:1px solid #2a2f3d;padding:12px;border-radius:8px}
    .actions{margin-top:14px;display:flex;gap:12px;flex-wrap:wrap}
  </style>
</head>
<body>
  <div class="wrap">
    <h2>Account</h2>
    <div class="card">
      <h3>Profil</h3>
      <div id="status" class="status" style="display:none"></div>
      <div id="out">Lade…</div>

      <h4>Kontodaten</h4>
      <div class="grid">
        <div><label>Benutzername / E-Mail</label><pre id="email">-</pre></div>
        <div><label>Provider</label><pre id="provider">-</pre></div>
        <div><label>Rolle</label><pre id="role">-</pre></div>
        <div><label>Admin</label><pre id="admin">-</pre></div>
        <div class="grid-1"><label>Registriert am</label><pre id="created">-</pre></div>
        <div class="grid-1"><label>Passwort zuletzt geändert</label><pre id="passwordChanged">-</pre></div>
      </div>

      <h4>Persönliche Daten</h4>
      <div class="grid">
        <div><label for="first">Vorname</label><input id="first"/></div>
        <div><label for="last">Nachname</label><input id="last"/></div>
        <div class="grid-1">
          <button id="saveNames">Vor- / Nachname speichern</button>
        </div>
      </div>

      <div class="actions">
        <button id="logout" class="ghost">Abmelden</button>
        <button id="refresh" class="ghost">Aktualisieren</button>
      </div>
    </div>
  </div>
<script>
const setStatus = (text, ok = false) => {
  const s = document.getElementById('status');
  if (!s) return;
  s.textContent = text;
  s.className = 'status ' + (ok ? 'status-ok' : 'status-bad');
  s.style.display = '';
};

const toDateTime = (v) => {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('de-DE', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const setValue = (id, value) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value == null ? '-' : String(value);
};

const fill = (profile) => {
  setValue('email', profile?.email || '-');
  setValue('provider', profile?.provider || '-');
  setValue('role', Array.isArray(profile?.roles) ? profile.roles.join(', ') : 'keine');
  setValue('admin', profile?.isAdmin ? 'Ja' : 'Nein');
  setValue('created', toDateTime(profile?.createdAt));
  setValue('passwordChanged', toDateTime(profile?.lastPasswordChangedAt));
  const firstEl = document.getElementById('first');
  const lastEl = document.getElementById('last');
  if (firstEl) firstEl.value = profile?.firstName || '';
  if (lastEl) lastEl.value = profile?.lastName || '';
  const out = document.getElementById('out');
  if (out) out.textContent = profile ? JSON.stringify(profile, null, 2) : 'Keine Profildaten verfügbar.';
};

const load = async () => {
  const token = localStorage.getItem('dashdesign_access_token') || '';
  if (!token) {
    localStorage.removeItem('dashdesign_access_token');
    const returnTo = encodeURIComponent(location.pathname + location.search);
    location.replace('/login?returnTo=' + returnTo);
    return;
  }

  const res = await fetch('/auth/me', { headers: { authorization: 'Bearer ' + token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    localStorage.removeItem('dashdesign_access_token');
    setStatus('Session nicht gültig. Weiterleitung zum Login…', false);
    const returnTo = encodeURIComponent(location.pathname + location.search);
    location.replace('/login?returnTo=' + returnTo);
    return;
  }

  fill(data.user || {});
  setStatus('Profil geladen.', true);
};

const saveNames = async () => {
  const token = localStorage.getItem('dashdesign_access_token') || '';
  const firstName = String(document.getElementById('first').value || '').trim();
  const lastName = String(document.getElementById('last').value || '').trim();
  const res = await fetch('/auth/profile', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ firstName, lastName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    setStatus(data?.error || 'Änderung nicht gespeichert.', false);
    return;
  }
  fill(data.profile || {});
  setStatus('Gespeichert.', true);
};

document.getElementById('saveNames').onclick = saveNames;
document.getElementById('refresh').onclick = load;
document.getElementById('logout').onclick = () => {
  localStorage.removeItem('dashdesign_access_token');
  location.replace('/login');
};

load();
</script>
</body>
</html>`;
}
