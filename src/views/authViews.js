function escapeHtmlAttr(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderLegalFooter() {
  return `
    <footer class="legal">
      <a href="https://dashdesign.eu/impressum/" target="_blank" rel="noopener noreferrer">Impressum</a>
      <span>·</span>
      <a href="https://hessenapp.de/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</a>
      <p>Hessen App GmbH © 2026 - Alle Rechte vorbehalten.</p>
    </footer>
  `;
}

export function renderPortalHtml({ returnTo = '' } = {}) {
  const safeReturnTo = escapeHtmlAttr(returnTo || '');
  const helperText = returnTo
    ? 'Nach erfolgreicher Anmeldung wirst du automatisch in die Ziel-App zurueckgeleitet.'
    : 'Melde dich mit deinem Account an, um mit deinem Profil weiterzuarbeiten.';

  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>dashdesign Login</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box}
    :root{
      --bg:#080a0f;
      --panel:#121624;
      --panel-edge:#27304a;
      --text:#e9edf8;
      --muted:#9ca7c2;
      --ok-bg:#113d2e;
      --ok-border:#2b6f5a;
      --bad-bg:#3d1a23;
      --bad-border:#6d2d36;
      --accent:#4d7cff;
      --accent-2:#45d3b6;
    }
    body{
      margin:0;
      min-height:100vh;
      color:var(--text);
      font-family:Manrope,system-ui,sans-serif;
      background:
        radial-gradient(70% 70% at 0% 0%, rgba(77,124,255,.22), transparent 65%),
        radial-gradient(60% 60% at 100% 100%, rgba(69,211,182,.18), transparent 60%),
        var(--bg);
      display:flex;
      align-items:center;
      justify-content:center;
      padding:24px;
    }
    .wrap{width:min(100%,520px)}
    .card{
      background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01));
      border:1px solid var(--panel-edge);
      border-radius:18px;
      padding:24px;
      box-shadow:0 28px 60px rgba(0,0,0,.4);
      backdrop-filter:blur(8px);
    }
    h1{margin:0 0 4px;font-size:28px;line-height:1.1;font-weight:800}
    .subtitle{margin:0 0 20px;color:var(--muted)}
    .helper{
      margin:10px 0 16px;
      color:var(--muted);
      font-size:14px;
      line-height:1.4;
    }
    form{display:grid;gap:14px}
    label{font-weight:700;font-size:14px}
    input,button{
      width:100%;
      border-radius:12px;
      padding:13px 14px;
      font:600 15px/1.2 Manrope,system-ui,sans-serif;
    }
    input{
      border:1px solid #36415e;
      background:#0c1020;
      color:var(--text);
      transition:border-color .2s, box-shadow .2s;
    }
    input:focus{
      outline:none;
      border-color:var(--accent);
      box-shadow:0 0 0 4px rgba(77,124,255,.2);
    }
    button{
      border:none;
      background:linear-gradient(135deg,var(--accent),#5570ff 55%,#6a66ff);
      color:#fff;
      cursor:pointer;
      font-weight:800;
      letter-spacing:.01em;
    }
    button[disabled]{opacity:.7;cursor:wait}
    .row{display:flex;gap:10px}
    .ghost{
      background:#202841;
      border:1px solid #324067;
      font-weight:700;
    }
    .err{
      background:var(--bad-bg);
      border:1px solid var(--bad-border);
      padding:12px;
      border-radius:10px;
      font-size:14px;
      line-height:1.35;
    }
    .status{
      display:none;
      margin-top:4px;
      padding:11px 12px;
      border-radius:10px;
      font-size:14px;
    }
    .status-ok{border:1px solid var(--ok-border);background:var(--ok-bg)}
    .status-bad{border:1px solid var(--bad-border);background:var(--bad-bg)}
    .legal{
      margin-top:18px;
      color:var(--muted);
      font-size:12px;
      display:flex;
      flex-wrap:wrap;
      align-items:center;
      gap:8px;
    }
    .legal p{
      margin:6px 0 0;
      width:100%;
      font-family:"JetBrains Mono",ui-monospace,monospace;
      font-size:11px;
      color:#90a0c8;
    }
    .legal a{color:#afc2ff;text-decoration:none}
    .legal a:hover{text-decoration:underline}
    @media (max-width:520px){
      .card{padding:18px}
      h1{font-size:24px}
      .row{flex-direction:column}
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card" id="login-app" data-return-to="${safeReturnTo}">
      <h1>dashdesign Login</h1>
      <p class="subtitle">Sicher anmelden und direkt weiterarbeiten.</p>
      <p class="helper">${helperText}</p>

      <form id="f" autocomplete="on" method="post" action="/auth/login">
        <div>
          <label for="u">Benutzername</label>
          <input required type="text" id="u" name="username" autocomplete="username" autocorrect="off" autocapitalize="none" spellcheck="false"/>
        </div>
        <div>
          <label for="p">Passwort</label>
          <input required type="password" id="p" name="password" autocomplete="current-password"/>
        </div>
        <div id="err"></div>
        <button id="submit" type="submit">Anmelden</button>
        <div id="status" class="status"></div>
        <div class="row">
          <button class="ghost" id="g" type="button">Google</button>
          <button class="ghost" id="a" type="button">Apple</button>
        </div>
      </form>
      ${renderLegalFooter()}
    </section>
  </main>
  <script defer src="/static/login.js"></script>
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
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box}
    :root{
      --bg:#080a0f;
      --panel:#121624;
      --panel-edge:#27304a;
      --text:#e9edf8;
      --muted:#9ca7c2;
      --ok-bg:#113d2e;
      --ok-border:#2b6f5a;
      --bad-bg:#3d1a23;
      --bad-border:#6d2d36;
      --accent:#4d7cff;
    }
    body{
      margin:0;
      min-height:100vh;
      color:var(--text);
      font-family:Manrope,system-ui,sans-serif;
      background:
        radial-gradient(65% 65% at 0% 0%, rgba(77,124,255,.22), transparent 60%),
        radial-gradient(55% 55% at 100% 100%, rgba(69,211,182,.16), transparent 60%),
        var(--bg);
      padding:24px;
    }
    .wrap{max-width:920px;margin:0 auto}
    .card{
      background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01));
      border:1px solid var(--panel-edge);
      border-radius:18px;
      padding:24px;
      box-shadow:0 28px 60px rgba(0,0,0,.4);
      backdrop-filter:blur(8px);
    }
    h1{margin:0 0 4px;font-size:30px;line-height:1.1;font-weight:800}
    .subtitle{margin:0 0 18px;color:var(--muted)}
    .status{
      display:none;
      margin-bottom:12px;
      padding:11px 12px;
      border-radius:10px;
      font-size:14px;
    }
    .status-ok{border:1px solid var(--ok-border);background:var(--ok-bg)}
    .status-bad{border:1px solid var(--bad-border);background:var(--bad-bg)}
    .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .grid-1{grid-column:1/-1}
    .panel{
      border:1px solid #2f3a59;
      background:#0e1324;
      border-radius:12px;
      padding:12px;
    }
    label{
      display:block;
      margin:0 0 6px;
      color:var(--muted);
      font-size:13px;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:.04em;
    }
    pre{
      margin:0;
      white-space:pre-wrap;
      font:600 14px/1.45 "JetBrains Mono",ui-monospace,monospace;
      color:#d9e4ff;
      word-break:break-word;
    }
    input{
      width:100%;
      border-radius:10px;
      padding:11px 12px;
      border:1px solid #36415e;
      background:#0c1020;
      color:var(--text);
      font:600 15px/1.2 Manrope,system-ui,sans-serif;
    }
    input:focus{
      outline:none;
      border-color:var(--accent);
      box-shadow:0 0 0 4px rgba(77,124,255,.2);
    }
    .actions{
      margin-top:16px;
      display:flex;
      flex-wrap:wrap;
      gap:10px;
    }
    button{
      border:none;
      border-radius:10px;
      padding:11px 14px;
      color:#fff;
      background:linear-gradient(135deg,var(--accent),#5b73ff);
      cursor:pointer;
      font:800 14px/1 Manrope,system-ui,sans-serif;
    }
    button.ghost{
      background:#202841;
      border:1px solid #324067;
      font-weight:700;
    }
    .legal{
      margin-top:18px;
      color:var(--muted);
      font-size:12px;
      display:flex;
      flex-wrap:wrap;
      align-items:center;
      gap:8px;
    }
    .legal p{
      margin:6px 0 0;
      width:100%;
      font-family:"JetBrains Mono",ui-monospace,monospace;
      font-size:11px;
      color:#90a0c8;
    }
    .legal a{color:#afc2ff;text-decoration:none}
    .legal a:hover{text-decoration:underline}
    @media (max-width:720px){
      .grid{grid-template-columns:1fr}
      h1{font-size:25px}
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card" id="account-app">
      <h1>Mein Account</h1>
      <p class="subtitle">Persoenliche Daten, Rollen und Sicherheitsstatus.</p>
      <div id="status" class="status"></div>

      <div class="grid">
        <div class="panel"><label>Benutzername / E-Mail</label><pre id="email">-</pre></div>
        <div class="panel"><label>Provider</label><pre id="provider">-</pre></div>
        <div class="panel"><label>Rollen</label><pre id="role">-</pre></div>
        <div class="panel"><label>Admin</label><pre id="admin">-</pre></div>
        <div class="panel grid-1"><label>Registriert am</label><pre id="created">-</pre></div>
        <div class="panel grid-1"><label>Passwort zuletzt geaendert</label><pre id="passwordChanged">-</pre></div>
      </div>

      <div style="margin-top:18px" class="grid">
        <div class="panel">
          <label for="first">Vorname</label>
          <input id="first" autocomplete="given-name"/>
        </div>
        <div class="panel">
          <label for="last">Nachname</label>
          <input id="last" autocomplete="family-name"/>
        </div>
      </div>

      <div class="actions">
        <button id="saveNames">Vor- und Nachname speichern</button>
        <button id="refresh" class="ghost">Aktualisieren</button>
        <button id="logout" class="ghost">Abmelden</button>
      </div>

      ${renderLegalFooter()}
    </section>
  </main>
  <script defer src="/static/account.js"></script>
</body>
</html>`;
}
