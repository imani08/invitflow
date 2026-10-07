import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('./themes/invitaflow/login/', import.meta.url);
const template = await readFile(new URL('register.ftl', root), 'utf8');
const css = await readFile(new URL('resources/css/invitaflow.css', root), 'utf8');
const french = await readFile(new URL('messages/messages_fr.properties', root), 'utf8');
const action = await readFile(new URL('./providers/invitaflow-legal-acceptance/src/main/java/com/invitaflow/keycloak/legal/LegalAcceptanceFormAction.java', import.meta.url), 'utf8');
const bootstrap = await readFile(new URL('./provision-legal-registration.mjs', import.meta.url), 'utf8');
const realm = JSON.parse(await readFile(new URL('./realm-export.json', import.meta.url), 'utf8'));
const emailBootstrap = await readFile(new URL('./provision-email.mjs', import.meta.url), 'utf8');
const emailFr = await readFile(new URL('./themes/invitaflow/email/messages/messages_fr.properties', import.meta.url), 'utf8');
const emailTemplate = await readFile(new URL('./themes/invitaflow/email/html/email-verification.ftl', import.meta.url), 'utf8');
const compose = await readFile(new URL('../../compose.yaml', import.meta.url), 'utf8');
const authSession = await readFile(new URL('../../apps/web/src/lib/auth-session.ts', import.meta.url), 'utf8');
const authCallback = await readFile(new URL('../../apps/web/src/app/api/auth/callback/route.ts', import.meta.url), 'utf8');

test('registration requires a fresh unchecked legal acceptance checkbox and public legal links', () => {
  const checkbox = /<input\b([^>]*\bname="invitaflow_legal_acceptance"[^>]*)>/i.exec(template)?.[1];
  assert.ok(checkbox, 'legal checkbox should exist');
  assert.match(checkbox, /type="checkbox"/);
  assert.match(checkbox, /value="accepted"/);
  assert.doesNotMatch(checkbox, /\bchecked\b/i);
  assert.match(template, /href="\$\{invitaflowPublicWebUrl\}\/legal\/cgu" target="_blank" rel="noopener noreferrer"/);
  assert.match(template, /href="\$\{invitaflowPublicWebUrl\}\/legal\/confidentialite" target="_blank" rel="noopener noreferrer"/);
  assert.match(french, /invitaflowLegalAcceptanceRequired=/);
});

test('acceptance component keeps keyboard focus visible and adapts to light, dark and narrow screens', () => {
  assert.match(css, /\.if-legal-acceptance input:focus-visible/);
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /--if-ink:/);
});

test('custom theme continues to inherit Keycloak login and password-reset templates', async () => {
  assert.equal(await readFile(new URL('login.ftl', root), 'utf8').catch(() => null), null);
  assert.equal(await readFile(new URL('login-reset-password.ftl', root), 'utf8').catch(() => null), null);
  assert.match(await readFile(new URL('theme.properties', root), 'utf8'), /parent=keycloak\.v2/);
});

test('server validates the checkbox and persists acceptance after user creation', () => {
  assert.match(action, /context\.validationError\(formData, List\.of\(new FormMessage\(CHECKBOX_NAME, ERROR_KEY\)\)\)/);
  assert.match(action, /context\.success\(\)/);
  assert.match(action, /Clock\.systemUTC\(\)/);
  assert.match(action, /user::setAttribute/);
  assert.match(bootstrap, /providerId === 'registration-user-creation'/);
  assert.match(bootstrap, /provider: 'invitaflow-legal-acceptance', priority: registrationForm\.userCreation\.priority \+ 1/);
  assert.match(bootstrap, /registrationFlow = customAlias/);
});

test('realm requires verification and rejects duplicate accounts while SMTP remains out of static realm config', () => {
  assert.equal(realm.verifyEmail, true);
  assert.equal(realm.loginWithEmailAllowed, true);
  assert.equal(realm.duplicateEmailsAllowed, false);
  assert.equal(realm.resetPasswordAllowed, true);
  assert.equal(realm.emailTheme, 'invitaflow');
  assert.equal('smtpServer' in realm, false);
  assert.match(emailBootstrap, /MAIL_PROVIDER/);
  assert.match(emailBootstrap, /KEYCLOAK_SMTP_PASSWORD/);
  assert.match(emailBootstrap, /emailAttribute\.required = .*'user'/);
  assert.match(emailBootstrap, /validations.*email/s);
  assert.doesNotMatch(emailFr, /^passwordResetBodyHtml=/m);
  assert.doesNotMatch(emailFr, /^executeActionsBodyHtml=/m);
  assert.doesNotMatch(emailBootstrap, /console\.(?:log|info|debug).*password/i);
});

test('email verification content is branded, explains expiry and includes the safe contact details', () => {
  assert.match(emailFr, /Vérifiez votre adresse e-mail/);
  assert.match(emailFr, /Ce lien expire dans \{0\}/);
  assert.match(emailFr, /fucushd098@gmail\.com/);
  assert.match(emailFr, /\+243973431495/);
  assert.match(emailTemplate, /emailVerificationLinkText/);
  assert.match(emailTemplate, /emailFooterOperator/);
  assert.match(emailTemplate, /linkExpirationFormatter\(linkExpiration\)/);
});

test('local email delivery defaults to Mailpit and SMTP credentials are required only in SMTP mode', () => {
  assert.match(compose, /MAIL_PROVIDER: \$\{MAIL_PROVIDER:-mailpit\}/);
  assert.match(emailBootstrap, /process\.env\['MAIL_PROVIDER'\] \?\? 'mailpit'/);
  assert.match(emailBootstrap, /provider === 'mailpit'[\s\S]*host: 'mailpit'[\s\S]*auth: 'false'/);
  assert.match(emailBootstrap, /provider === 'mailpit'[\s\S]*: smtpConfiguration\(\)/);
  assert.match(emailBootstrap, /if \(!user \|\| !password\) throw new Error\('SMTP mode requires KEYCLOAK_SMTP_USER and KEYCLOAK_SMTP_PASSWORD'\)/);
  assert.doesNotMatch(emailBootstrap, /console\.(?:log|info|debug|error).*password/i);
});

test('the standard email scope is assigned to the web client and emits both claims in the ID token', () => {
  const client = realm.clients.find((entry) => entry.clientId === 'invitaflow-web');
  const scope = realm.clientScopes.find((entry) => entry.name === 'email');
  assert.ok(client?.defaultClientScopes.includes('email'));
  assert.ok(scope);
  assert.ok(scope.protocolMappers.some((mapper) => mapper.config['claim.name'] === 'email' && mapper.config['user.attribute'] === 'email' && mapper.config['id.token.claim'] === 'true'));
  assert.ok(scope.protocolMappers.some((mapper) => mapper.config['claim.name'] === 'email_verified' && mapper.config['user.attribute'] === 'emailVerified' && mapper.config['id.token.claim'] === 'true'));
  assert.equal(realm.clientScopes.some((entry) => entry.name === 'invitaflow-email'), false);
  assert.match(authSession, /scope: 'openid profile email'/);
  assert.match(authSession, /code_challenge_method: 'S256'/);
  assert.match(authSession, /code_verifier: attempt\.verifier/);
  assert.match(authSession, /getDefaultPostLoginDestination\(returnTo\)/);
});

test('new users require email verification and the callback gates session creation on verified email', () => {
  assert.equal(realm.verifyEmail, true);
  assert.ok(realm.requiredActions.some((action) => action.alias === 'VERIFY_EMAIL' && action.enabled && action.defaultAction));
  assert.match(authSession, /payload\['email_verified'\] === true/);
  assert.match(authSession, /if \(!isVerifiedEmailClaim\(payload\)\) throw new EmailVerificationRequiredError\(\)/);
  assert.match(authCallback, /EmailVerificationRequiredError/);
});
