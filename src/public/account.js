const statusEl = document.getElementById('status');

const setStatus = (text, ok = false) => {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = 'status ' + (ok ? 'status-ok' : 'status-bad');
  statusEl.style.display = 'block';
};

const toDateTime = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('de-DE', {
    year: 'numeric',
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
  el.textContent = value == null || value === '' ? '-' : String(value);
};

const fillProfile = (profile) => {
  setValue('email', profile?.email || '-');
  setValue('provider', profile?.provider || '-');
  setValue('role', Array.isArray(profile?.roles) ? profile.roles.join(', ') : 'keine');
  setValue('admin', profile?.isAdmin ? 'Ja' : 'Nein');
  setValue('created', toDateTime(profile?.createdAt));
  setValue('passwordChanged', toDateTime(profile?.lastPasswordChangedAt));

  const first = document.getElementById('first');
  const last = document.getElementById('last');
  if (first) first.value = profile?.firstName || '';
  if (last) last.value = profile?.lastName || '';
};

const redirectToLogin = () => {
  localStorage.removeItem('dashdesign_access_token');
  const returnTo = encodeURIComponent(location.pathname + location.search);
  location.replace('/login?returnTo=' + returnTo);
};

const loadProfile = async () => {
  const token = localStorage.getItem('dashdesign_access_token') || '';
  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    const res = await fetch('/auth/me', { headers: { authorization: 'Bearer ' + token } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      setStatus('Session ist nicht gueltig. Bitte erneut anmelden.', false);
      redirectToLogin();
      return;
    }
    fillProfile(data.user || {});
    setStatus('Profil geladen.', true);
  } catch {
    setStatus('Netzwerkfehler beim Laden des Profils.', false);
  }
};

const saveNames = async () => {
  const token = localStorage.getItem('dashdesign_access_token') || '';
  if (!token) {
    redirectToLogin();
    return;
  }

  const firstName = String(document.getElementById('first')?.value || '').trim();
  const lastName = String(document.getElementById('last')?.value || '').trim();
  if (!firstName && !lastName) {
    setStatus('Bitte Vorname oder Nachname ausfuellen.', false);
    return;
  }

  try {
    const res = await fetch('/auth/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ firstName, lastName }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      if (res.status === 401) {
        redirectToLogin();
        return;
      }
      setStatus(data?.error || 'Aenderung konnte nicht gespeichert werden.', false);
      return;
    }
    fillProfile(data.profile || {});
    setStatus('Aenderungen gespeichert.', true);
  } catch {
    setStatus('Netzwerkfehler beim Speichern.', false);
  }
};

const saveBtn = document.getElementById('saveNames');
if (saveBtn) saveBtn.addEventListener('click', saveNames);

const refreshBtn = document.getElementById('refresh');
if (refreshBtn) refreshBtn.addEventListener('click', loadProfile);

const logoutBtn = document.getElementById('logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('dashdesign_access_token');
    location.replace('/login');
  });
}

loadProfile();
