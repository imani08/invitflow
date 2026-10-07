import net from 'node:net';

const baseUrl = process.env['KEYCLOAK_INTERNAL_URL'] ?? 'http://keycloak:8080';
const adminUsername = process.env['KEYCLOAK_ADMIN'];
const adminPassword = process.env['KEYCLOAK_ADMIN_PASSWORD'];
const provider = process.env['MAIL_PROVIDER'] ?? 'mailpit';
const from = process.env['KEYCLOAK_SMTP_FROM'] ?? 'fucushd098@gmail.com';
const displayName = process.env['KEYCLOAK_SMTP_FROM_DISPLAY_NAME'] ?? 'InvitaFlow — FOCUS HD ENTREPRISES';
if (!adminUsername || !adminPassword) throw new Error('Keycloak bootstrap administrator credentials are required');
if (!['mailpit', 'smtp'].includes(provider)) throw new Error('MAIL_PROVIDER must be mailpit or smtp');

const smtp = provider === 'mailpit'
  ? { host: 'mailpit', port: '1025', from, fromDisplayName: displayName, auth: 'false', ssl: 'false', starttls: 'false' }
  : smtpConfiguration();

function smtpConfiguration() {
  const host = process.env['KEYCLOAK_SMTP_HOST'] ?? 'smtp.gmail.com';
  const port = Number(process.env['KEYCLOAK_SMTP_PORT'] ?? '587');
  const user = process.env['KEYCLOAK_SMTP_USER'];
  const password = process.env['KEYCLOAK_SMTP_PASSWORD'];
  const starttls = process.env['KEYCLOAK_SMTP_STARTTLS'] ?? 'true';
  const ssl = process.env['KEYCLOAK_SMTP_SSL'] ?? 'false';
  if (!/^[a-z0-9.-]+$/i.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP host or port');
  if (!user || !password) throw new Error('SMTP mode requires KEYCLOAK_SMTP_USER and KEYCLOAK_SMTP_PASSWORD');
  if (!['true', 'false'].includes(starttls) || !['true', 'false'].includes(ssl) || starttls === ssl) throw new Error('SMTP requires exactly one of STARTTLS or SSL');
  if (host === 'smtp.gmail.com' && (port !== 587 || starttls !== 'true' || ssl !== 'false')) throw new Error('Gmail SMTP must use port 587 with STARTTLS');
  return { host, port: String(port), from, fromDisplayName: displayName, auth: 'true', user, password, ssl, starttls };
}

async function waitForMailpit() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const available = await new Promise((resolve) => {
      const socket = net.connect({ host: 'mailpit', port: 1025 });
      socket.setTimeout(1_000);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
    });
    if (available) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('Mailpit is not accepting SMTP connections');
}
if (provider === 'mailpit') await waitForMailpit();

let token;
let tokenError;
for (let attempt = 0; attempt < 30 && !token; attempt++) {
  try {
    const response = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: adminUsername, password: adminPassword }),
      signal: AbortSignal.timeout(8_000),
    });
    if (response.ok) token = (await response.json()).access_token;
    else tokenError = `Keycloak token endpoint returned ${response.status}`;
  } catch (error) { tokenError = error instanceof Error ? error.message : String(error); }
  if (!token) await new Promise((resolve) => setTimeout(resolve, 2_000));
}
if (!token) throw new Error(`Could not authenticate to Keycloak admin API: ${tokenError}`);

const realmUrl = `${baseUrl}/admin/realms/invitaflow-dev`;
const response = await fetch(realmUrl, {
  headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000),
});
if (!response.ok) throw new Error(`Could not read Keycloak realm settings (${response.status})`);
const realm = await response.json();
realm.smtpServer = smtp;
realm.emailTheme = 'invitaflow';
realm.verifyEmail = true;
realm.resetPasswordAllowed = true;
realm.loginWithEmailAllowed = true;
realm.duplicateEmailsAllowed = false;
const update = await fetch(realmUrl, {
  method: 'PUT',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(realm), signal: AbortSignal.timeout(8_000),
});
if (!update.ok) throw new Error(`Could not configure Keycloak email delivery (${update.status})`);

const profileUrl = `${realmUrl}/users/profile`;
const profileResponse = await fetch(profileUrl, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) });
if (!profileResponse.ok) throw new Error(`Could not read Keycloak user profile configuration (${profileResponse.status})`);
const profile = await profileResponse.json();
if (!Array.isArray(profile.attributes)) throw new Error('Keycloak user profile configuration has no attributes array');
const emailAttribute = profile.attributes.find((attribute) => attribute.name === 'email');
if (!emailAttribute) throw new Error('Keycloak user profile has no managed email attribute');
emailAttribute.required = { ...(emailAttribute.required ?? {}), roles: [...new Set([...(emailAttribute.required?.roles ?? []), 'user'])] };
emailAttribute.validations = { ...(emailAttribute.validations ?? {}), email: { ...(emailAttribute.validations?.email ?? {}) } };
const profileUpdate = await fetch(profileUrl, {
  method: 'PUT', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(profile), signal: AbortSignal.timeout(8_000),
});
if (!profileUpdate.ok) throw new Error(`Could not require a valid Keycloak registration email (${profileUpdate.status})`);
process.stdout.write(`Keycloak email delivery configured (${provider}). Credentials were not logged.\n`);
