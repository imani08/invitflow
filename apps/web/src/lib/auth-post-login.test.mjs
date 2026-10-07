import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const landing = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const callback = await readFile(new URL('../app/api/auth/callback/route.ts', import.meta.url), 'utf8');
const authSession = await readFile(new URL('./auth-session.ts', import.meta.url), 'utf8');
const postLogin = await readFile(new URL('../components/app-navbar-items.mjs', import.meta.url), 'utf8');

test('public landing keeps login links while a valid server session points calls to the account', () => {
  assert.match(landing, /import \{ cookies \} from 'next\/headers'/);
  assert.match(landing, /getSession\(cookieStore\.get\(sessionCookieName\(\)\)\?\.value\)/);
  assert.match(landing, /const accountHref = session \? '\/account' : '\/api\/auth\/login'/);
  assert.match(landing, /href=\{accountHref\}/);
  assert.match(landing, /session \? 'Accéder à mon espace' : 'Commencer à créer'/);
  assert.doesNotMatch(landing, /session\.accessToken|session\.refreshToken/);
});

test('stale callback with a valid existing session returns home without replacing the session', () => {
  assert.match(callback, /const existingSession = await getSession\(cookieStore\.get\(sessionCookieName\(\)\)\?\.value\)/);
  assert.match(callback, /if \(existingSession\) \{\s*const response = NextResponse\.redirect\(publicUrl\('\/'\)\)/);
  assert.match(callback, /EmailVerificationRequiredError[\s\S]*auth=verification-required/);
  assert.match(callback, /auth=failed/);
  assert.match(callback, /\{ name: error\.name, message: error\.message \}/);
  assert.doesNotMatch(callback, /error\.stack|console\.(?:log|error).*\b(?:code|token|cookie|state|nonce)\b/i);
});

test('login keeps one-time state, PKCE, nonce and ID token claim validation', () => {
  assert.match(authSession, /client\.getDel\(opaqueKey\('oidc:state', state\)\)/);
  assert.match(authSession, /code_challenge_method: 'S256'/);
  assert.match(authSession, /code_verifier: attempt\.verifier/);
  assert.match(authSession, /nonce/);
  assert.match(authSession, /issuer: config\.issuer/);
  assert.match(authSession, /audience: clientId/);
  assert.match(authSession, /payload\['azp'\] !== clientId/);
  assert.match(authSession, /if \(!isVerifiedEmailClaim\(payload\)\) throw new EmailVerificationRequiredError\(\)/);
  assert.match(authSession, /await client\.set\(opaqueKey\('auth:session', sessionId\)/);
  assert.match(callback, /response\.cookies\.set\(sessionCookieName\(\), sessionId, cookieOptions\(\)\)/);
});

test('successful callback uses the dashboard fallback and sets the session cookie on its redirect', () => {
  assert.match(postLogin, /isSafeReturnTo\(returnTo\) \? returnTo : '\/dashboard'/);
  assert.match(callback, /NextResponse\.redirect\(publicUrl\(getDefaultPostLoginDestination\(returnTo\)\)\)/);
  assert.ok(callback.indexOf('NextResponse.redirect(publicUrl(getDefaultPostLoginDestination(returnTo)))') < callback.indexOf('response.cookies.set(sessionCookieName(), sessionId, cookieOptions())'));
});
