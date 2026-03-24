import {
  BOOTSTRAP_ADMIN_PROVIDER,
  MONITOR_ADMIN_EMAILS,
  MONITOR_EDITOR_EMAILS,
  MONITOR_VIEWER_EMAILS,
} from '../config/env.js';

export function resolveRoles(email, provider = '') {
  const normalized = String(email || '').toLowerCase().trim();
  const roles = new Set();

  if (provider === BOOTSTRAP_ADMIN_PROVIDER) roles.add('admin');
  if (MONITOR_VIEWER_EMAILS.includes(normalized)) roles.add('monitor_viewer');
  if (MONITOR_EDITOR_EMAILS.includes(normalized)) roles.add('monitor_editor');
  if (MONITOR_ADMIN_EMAILS.includes(normalized)) roles.add('admin');

  if (roles.has('admin')) roles.add('monitor_editor');
  if (roles.has('monitor_editor')) roles.add('monitor_viewer');

  return [...roles];
}
