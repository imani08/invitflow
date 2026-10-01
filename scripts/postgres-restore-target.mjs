import { isIP } from 'node:net';

export function parseIsolatedPostgresTarget(value) {
  if (typeof value !== 'string' || value.length > 4096) {
    throw new Error('RESTORE_TARGET_URL must be a PostgreSQL URL for an isolated target.');
  }

  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error('RESTORE_TARGET_URL must be a valid URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(target.protocol)) {
    throw new Error('RESTORE_TARGET_URL must use postgres:// or postgresql://.');
  }
  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || !target.username || !target.pathname || target.pathname === '/') {
    throw new Error('RESTORE_TARGET_URL must identify a host, superuser and explicit database.');
  }
  if (['host', 'hostaddr', 'service', 'dbname', 'user', 'options'].some((key) => target.searchParams.has(key))) {
    throw new Error('RESTORE_TARGET_URL must not override its host, database or user through query parameters.');
  }
  if (hostname === 'postgres' || hostname === 'localhost' || hostname.endsWith('.localhost') || isLoopbackIp(hostname)) {
    throw new Error('RESTORE_TARGET_URL must not target the active Compose database or a local host.');
  }

  let database;
  try {
    database = decodeURIComponent(target.pathname.slice(1));
  } catch {
    throw new Error('RESTORE_TARGET_URL contains an invalid database name.');
  }
  if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,62}$/.test(database)) {
    throw new Error('RESTORE_TARGET_URL must contain one explicit PostgreSQL database name.');
  }

  return { hostname, database };
}

function isLoopbackIp(hostname) {
  const family = isIP(hostname);
  if (family === 4) return hostname.startsWith('127.');
  if (family === 6) return hostname === '::1';
  return false;
}
