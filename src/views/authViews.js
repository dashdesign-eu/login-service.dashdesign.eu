export function renderPortalHtml({ returnTo = '' } = {}) {
  const escaped = JSON.stringify(returnTo || '');
  const helperText = returnTo
    ? 'Dein Login wird direkt in die Ziel-App zurückgeleitet.'
    : 'Kein returnTo gesetzt. Login geht danach zu /account.';

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>dashdesign Login</title>
  <style>
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
      <form id="f">
        <label>Benutzername oder E-Mail</label><br/>
        <input required type="text" id="u" name="username" autocomplete="username" autocorrect="off" autocapitalize="none" spellcheck="false"/><br/><br/>
        <label>Passwort</label><br/>
        <input required type="password" id="p"/>
        <div id="err"></div>
        <button type="submit">Anmelden</button>
        <div id="status" class="status status-bad">Bin ich angemeldet?</div>
        <p class="muted" style="margin:8px 0">Hier siehst du sofort, ob du angemeldet bist.</p>
        <button class="ghost" id="whoami" type="button">Bin ich angemeldet?</button>
        <div class="row">
          <button class="ghost" id="g" type="button">Google</button>
          <button class="ghost" id="a" type="button">Apple</button>
        </div>
      </form>
      <p class="muted" style="margin-top:10px">${helperText} <a href="/account">/account</a></p>
    </div>
  </div>
<script>
const returnTo = ${escaped};
const err = (m='') => document.getElementById('err').innerHTML = m ? '<div class="err">'+m+'</div>' : '';
const statusEl = document.getElementById('status');

const setStatus = (text, ok = false) => {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'status ' + (ok ? 'status-ok' : 'status-bad');
};

const checkSignedIn = async () => {
  const t = localStorage.getItem('dashdesign_access_token') || '';
  if (!t) return setStatus('Nein, du bist nicht angemeldet.', false);
  try {
    const res = await fetch('/auth/me', { headers: { authorization: 'Bearer ' + t } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) return setStatus('Session ungültig oder abgelaufen.', false);
    const email = data?.user?.email || 'unbekannt';
    const roles = (data?.user?.roles || []).join(', ') || 'keine';
    return setStatus('Ja, du bist angemeldet als ' + email + ' (' + roles + ').', true);
  } catch {
    return setStatus('Session prüfen fehlgeschlagen.', false);
  }
};

if (localStorage.getItem('dashdesign_access_token')) {
  checkSignedIn();
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
  const endpoint = returnTo ? '/auth/redirect/complete' : '/auth/login';
  const body = returnTo ? { username, password, returnTo } : { username, password };
  const res = await fetch(endpoint, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) return err(data?.error || 'login_failed');

  if (returnTo) {
    location.href = data.redirectTo;
    return;
  }

  const token = String(data.token || '').replace(/^Bearer\s+/i, '');
  if (token) localStorage.setItem('dashdesign_access_token', token);
  location.href = '/account';
};

document.getElementById('whoami').onclick = checkSignedIn;
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
  <style>body{font-family:Inter,system-ui,Arial,sans-serif;background:#0f1116;color:#fff;margin:0}.wrap{max-width:680px;margin:40px auto;padding:24px}.card{background:#171a22;border:1px solid #2a2f3d;border-radius:12px;padding:20px}pre{white-space:pre-wrap;background:#0f1116;border:1px solid #2a2f3d;padding:12px;border-radius:8px}button{padding:10px 14px;border-radius:8px;border:none;background:#6d5efc;color:#fff;cursor:pointer}</style>
</head>
<body>
  <div class="wrap">
    <h2>Account</h2>
    <div class="card">
      <p>Bin ich angemeldet?</p>
      <pre id="out">Lade…</pre>
      <button id="logout">Logout lokal</button>
    </div>
  </div>
<script>
async function load() {
  const token = localStorage.getItem('dashdesign_access_token') || '';
  if (!token) { document.getElementById('out').textContent = 'Nicht angemeldet. Bitte /login öffnen.'; return; }
  const res = await fetch('/auth/me', { headers: { authorization: 'Bearer ' + token } });
  const data = await res.json().catch(() => ({}));
  document.getElementById('out').textContent = JSON.stringify(data?.user || data, null, 2);
}

load();
document.getElementById('logout').onclick = () => { localStorage.removeItem('dashdesign_access_token'); location.reload(); };
</script>
</body>
</html>`;
}
