const root = document.getElementById('login-app');
const returnTo = root?.dataset?.returnTo || '';

const form = document.getElementById('f');
const statusEl = document.getElementById('status');
const errEl = document.getElementById('err');
const submitBtn = document.getElementById('submit');
const userInput = document.getElementById('u');
const passInput = document.getElementById('p');

const ERROR_TEXT = {
  invalid_credentials: 'Falsche Zugangsdaten.',
  password_not_set: 'Fuer dieses Konto ist kein Passwort gesetzt.',
  invalid_input: 'Bitte Benutzername und Passwort eingeben.',
  too_many_requests: 'Zu viele Versuche. Bitte kurz warten und erneut probieren.',
  internal_error: 'Serverfehler bei der Anmeldung. Bitte spaeter erneut versuchen.',
};

const isInternalReturnTo = (url = '') => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//');

const setStatus = (text, ok = false) => {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'status ' + (ok ? 'status-ok' : 'status-bad');
  statusEl.style.display = 'block';
};

const setError = (text = '') => {
  if (!errEl) return;
  errEl.innerHTML = text ? '<div class="err">' + text + '</div>' : '';
};

const setSubmitting = (loading) => {
  if (!submitBtn) return;
  submitBtn.disabled = !!loading;
  submitBtn.textContent = loading ? 'Anmeldung laeuft...' : 'Anmelden';
};

const parseError = (payload = {}, fallback = 'Anmeldung fehlgeschlagen.') => {
  const key = payload?.error;
  return ERROR_TEXT[key] || key || fallback;
};

const cleanupSensitiveQuery = () => {
  const params = new URLSearchParams(window.location.search);
  if (!params.get('username') && !params.get('password')) return;

  const prefillUsername = params.get('username') || '';
  if (userInput && prefillUsername) userInput.value = prefillUsername;
  params.delete('username');
  params.delete('password');

  const next = params.toString();
  const cleanUrl = next ? '/login?' + next : '/login';
  if (window.history?.replaceState) window.history.replaceState({}, '', cleanUrl);
};

const checkExistingSession = async () => {
  const token = localStorage.getItem('dashdesign_access_token') || '';
  if (!token) return null;

  try {
    const res = await fetch('/auth/me', { headers: { authorization: 'Bearer ' + token } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      localStorage.removeItem('dashdesign_access_token');
      return null;
    }
    return { token, user: data.user || {} };
  } catch {
    return null;
  }
};

const continueExternalSession = async (token, externalReturnTo) => {
  const res = await fetch('/auth/redirect/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ returnTo: externalReturnTo }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok || !data?.redirectTo) return null;
  return data.redirectTo;
};

const bootstrap = async () => {
  const session = await checkExistingSession();
  if (!session) return;

  if (returnTo) {
    if (isInternalReturnTo(returnTo)) {
      location.replace(returnTo);
      return;
    }
    try {
      const redirectTo = await continueExternalSession(session.token, returnTo);
      if (redirectTo) {
        location.replace(redirectTo);
        return;
      }
      setStatus('Session erkannt, Weiterleitung aber fehlgeschlagen. Bitte erneut anmelden.', false);
      localStorage.removeItem('dashdesign_access_token');
      return;
    } catch {
      setStatus('Session erkannt, Weiterleitung aber fehlgeschlagen. Bitte erneut anmelden.', false);
      localStorage.removeItem('dashdesign_access_token');
      return;
    }
  }

  location.replace('/account');
};

const submitLogin = async (event) => {
  event.preventDefault();
  setError('');
  const username = String(userInput?.value || '').trim();
  const password = String(passInput?.value || '');

  if (!username || !password) {
    setError(ERROR_TEXT.invalid_input);
    return;
  }

  setSubmitting(true);
  try {
    const externalFlow = !!returnTo && !isInternalReturnTo(returnTo);
    const endpoint = externalFlow ? '/auth/redirect/complete' : '/auth/login';
    const body = externalFlow ? { username, password, returnTo } : { username, password };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      if (res.status === 401) localStorage.removeItem('dashdesign_access_token');
      setError(parseError(data));
      return;
    }

    const accessToken = String(data.token || '').replace(/^Bearer\s+/i, '');
    if (accessToken) localStorage.setItem('dashdesign_access_token', accessToken);

    if (returnTo) {
      if (isInternalReturnTo(returnTo)) {
        location.replace(returnTo);
        return;
      }
      if (data.redirectTo) {
        location.replace(data.redirectTo);
        return;
      }
      setError('Login erfolgreich, aber Weiterleitung konnte nicht erstellt werden.');
      return;
    }

    location.replace('/account');
  } catch {
    setError('Netzwerkfehler. Bitte Verbindung pruefen und erneut versuchen.');
  } finally {
    setSubmitting(false);
  }
};

cleanupSensitiveQuery();
bootstrap();

if (form) form.addEventListener('submit', submitLogin);

const googleBtn = document.getElementById('g');
if (googleBtn) {
  googleBtn.addEventListener('click', () => {
    const q = returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : '';
    location.href = '/auth/google/start' + q;
  });
}

const appleBtn = document.getElementById('a');
if (appleBtn) {
  appleBtn.addEventListener('click', () => {
    const q = returnTo ? '?returnTo=' + encodeURIComponent(returnTo) : '';
    location.href = '/auth/apple/start' + q;
  });
}
