import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const route = await readFile(new URL('../app/api/auth/logout/route.ts', import.meta.url), 'utf8');
const session = await readFile(new URL('./auth-session.ts', import.meta.url), 'utf8');
const profile = await readFile(new URL('../app/account/profile-form.tsx', import.meta.url), 'utf8');
const navbar = await readFile(new URL('../components/AppNavbar.tsx', import.meta.url), 'utf8');

test('valid POST logout destroys the Redis session and redirects with HTTP 303', () => {
  assert.match(route, /await destroySession\(sessionId\)/);
  assert.match(route, /NextResponse\.redirect\(\s*new URL\('\/', process\.env\['WEB_ORIGIN'\] \?\? 'http:\/\/localhost:3000'\),\s*\{ status: 303 \},?\s*\)/);
  assert.match(route, /response\.cookies\.set\(sessionCookieName\(\), '', \{ \.\.\.cookieOptions\(\), maxAge: 0 \}\)/);
  assert.match(route, /response\.headers\.set\('Cache-Control', 'no-store'\)/);
  assert.doesNotMatch(route, /NextResponse\.json\(\{\s*signedOut\s*:/);
});

test('cross-origin logout remains forbidden before session destruction', () => {
  const originCheck = route.indexOf('isExpectedOrigin(');
  const destroy = route.indexOf('await destroySession(sessionId)');
  assert.ok(originCheck >= 0 && destroy > originCheck);
  assert.match(route, /NextResponse\.json\(\{ error: 'forbidden' \}, \{ status: 403 \}\)/);
});

test('local cookie is expired and browser is redirected even when session destruction fails', () => {
  const catchStart = route.indexOf('} catch {');
  const cookieExpiry = route.indexOf('response.cookies.set(');
  const redirect = route.indexOf('NextResponse.redirect(');
  assert.ok(catchStart > 0 && cookieExpiry > catchStart);
  assert.ok(redirect >= 0 && cookieExpiry > redirect);
  assert.match(route, /Expire the browser cookie even if the identity provider is unavailable/);
});

test('destroySession still atomically removes the Redis session and attempts Keycloak logout', () => {
  const destroyStart = session.indexOf('export async function destroySession(');
  const destroySource = session.slice(destroyStart);
  assert.match(destroySource, /client\.getDel\(key\)/);
  assert.match(destroySource, /fetch\(config\.logout/);
  assert.match(destroySource, /identity_logout_revocation_unavailable/);
});

test('logout callers do not depend on the former JSON response', () => {
  assert.match(profile, /await fetch\('\/api\/auth\/logout', \{ method: 'POST' \}\);\s*window\.location\.assign\('\/'\)/);
  assert.match(navbar, /action="\/api\/auth\/logout" method="post"/);
  assert.doesNotMatch(profile, /signedOut/);
  assert.doesNotMatch(navbar, /signedOut/);
});
