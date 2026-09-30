import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createClient } from 'redis';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOGIN_TTL_SECONDS = 5 * 60;
const redisUrl = process.env['REDIS_URL'];
const issuer = process.env['KEYCLOAK_ISSUER_URL'];
const publicBase = process.env['KEYCLOAK_PUBLIC_URL'];
const internalBase = process.env['KEYCLOAK_INTERNAL_URL'];
const clientId = process.env['OIDC_CLIENT_ID'] ?? 'invitaflow-web';
const callbackUrl = process.env['OIDC_REDIRECT_URI'] ?? 'http://localhost:3000/api/auth/callback';

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

let redisClient: ReturnType<typeof createClient> | undefined;
let redisConnection: Promise<ReturnType<typeof createClient>> | undefined;
async function redis() {
  if (!redisClient) {
    redisClient = createClient({ url: required(redisUrl, 'REDIS_URL') });
    redisClient.on('error', () => console.error(JSON.stringify({ level: 'error', event: 'auth_session_redis_error' })));
  }
  if (redisClient.isReady) return redisClient;
  if (!redisConnection) {
    const connectingClient = redisClient;
    redisConnection = connectingClient.connect()
      .then(() => connectingClient)
      .catch((error: unknown) => {
        if (redisClient === connectingClient) redisClient = undefined;
        throw error;
      })
      .finally(() => { redisConnection = undefined; });
  }
  const connection = redisConnection;
  if (!connection) throw new Error('Redis connection was not initialized');
  return connection;
}

function randomOpaqueValue(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function opaqueKey(prefix: string, value: string) {
  const digest = createHash('sha256').update(value).digest('base64url');
  return `${prefix}:${digest}`;
}

function sessionEncryptionKey() {
  const secret = required(process.env['AUTH_SESSION_SECRET'], 'AUTH_SESSION_SECRET');
  if (secret.length < 32) throw new Error('AUTH_SESSION_SECRET must contain at least 32 characters');
  return createHash('sha256').update(`invitaflow-auth-session\0${secret}`).digest();
}

function encrypt(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sessionEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decrypt(value: string): unknown {
  const [ivText, tagText, encryptedText] = value.split('.');
  if (!ivText || !tagText || !encryptedText) throw new Error('Invalid encrypted session record');
  const decipher = createDecipheriv('aes-256-gcm', sessionEncryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as unknown;
}

function verifierChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function endpoints() {
  const publicUrl = required(publicBase, 'KEYCLOAK_PUBLIC_URL');
  const internalUrl = required(internalBase, 'KEYCLOAK_INTERNAL_URL');
  const realm = required(issuer, 'KEYCLOAK_ISSUER_URL').replace(/\/$/, '').split('/').at(-1);
  if (!realm) throw new Error('KEYCLOAK_ISSUER_URL must include a realm');
  return {
    authorize: `${publicUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/auth`,
    token: `${internalUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/token`,
    logout: `${internalUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/logout`,
    jwks: new URL(`${internalUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/certs`),
    issuer: required(issuer, 'KEYCLOAK_ISSUER_URL').replace(/\/$/, ''),
  };
}

export type OidcUser = { sub: string; email?: string; name?: string; email_verified?: boolean };
export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  user: OidcUser;
};

type LoginAttempt = { verifier: string; nonce: string; returnTo: string };
type TokenSet = { access_token: string; refresh_token: string; expires_in: number; id_token?: string };

function parseTokenSet(value: unknown): TokenSet {
  if (!value || typeof value !== 'object') throw new Error('Invalid token response');
  const token = value as Record<string, unknown>;
  if (typeof token['access_token'] !== 'string' || typeof token['refresh_token'] !== 'string' || typeof token['expires_in'] !== 'number') {
    throw new Error('Incomplete token response');
  }
  return {
    access_token: token['access_token'],
    refresh_token: token['refresh_token'],
    expires_in: token['expires_in'],
    ...(typeof token['id_token'] === 'string' ? { id_token: token['id_token'] } : {}),
  };
}

function isSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const user = item['user'];
  return typeof item['accessToken'] === 'string'
    && typeof item['refreshToken'] === 'string'
    && typeof item['accessTokenExpiresAt'] === 'number'
    && !!user && typeof user === 'object' && typeof (user as Record<string, unknown>)['sub'] === 'string';
}

export function sessionCookieName() {
  return process.env['NODE_ENV'] === 'production' ? '__Host-invitaflow-session' : 'invitaflow-session';
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function createLoginRedirect(returnTo: string): Promise<string> {
  const state = randomOpaqueValue();
  const nonce = randomOpaqueValue();
  const verifier = randomOpaqueValue(48);
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('\\') ? returnTo : '/account';
  const attempt: LoginAttempt = { verifier, nonce, returnTo: safeReturnTo };
  await (await redis()).set(opaqueKey('oidc:state', state), encrypt(attempt), { EX: LOGIN_TTL_SECONDS });

  const url = new URL(endpoints().authorize);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: verifierChallenge(verifier),
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

async function requestToken(form: URLSearchParams): Promise<TokenSet> {
  const response = await fetch(endpoints().token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Identity provider token request failed (${response.status})`);
  return parseTokenSet(await response.json());
}

export async function finishLogin(code: string, state: string): Promise<{ sessionId: string; returnTo: string }> {
  const client = await redis();
  const saved = await client.getDel(opaqueKey('oidc:state', state));
  if (!saved) throw new Error('Login state is missing or expired');
  const attempt = decrypt(saved) as LoginAttempt;
  const tokens = await requestToken(new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: callbackUrl,
    code,
    code_verifier: attempt.verifier,
  }));

  if (!tokens.id_token) throw new Error('Identity provider did not return an ID token');
  const config = endpoints();
  const jwks = createRemoteJWKSet(config.jwks);
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: config.issuer,
    audience: clientId,
    algorithms: ['RS256'],
    maxTokenAge: '5m',
  });
  if (payload['nonce'] !== attempt.nonce || payload['azp'] !== clientId || typeof payload['sub'] !== 'string') {
    throw new Error('ID token nonce, authorized party or subject is invalid');
  }

  const user: OidcUser = {
    sub: payload['sub'],
    ...(typeof payload['email'] === 'string' ? { email: payload['email'] } : {}),
    ...(typeof payload['name'] === 'string' ? { name: payload['name'] } : {}),
    ...(typeof payload['email_verified'] === 'boolean' ? { email_verified: payload['email_verified'] } : {}),
  };
  const session: AuthSession = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    user,
  };
  const sessionId = randomOpaqueValue();
  await client.set(opaqueKey('auth:session', sessionId), encrypt(session), { EX: SESSION_TTL_SECONDS });
  return { sessionId, returnTo: attempt.returnTo };
}

async function readSession(sessionId: string): Promise<AuthSession | null> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(sessionId)) return null;
  const client = await redis();
  const key = opaqueKey('auth:session', sessionId);
  const saved = await client.get(key);
  if (!saved) return null;
  const parsed: unknown = decrypt(saved);
  if (!isSession(parsed)) {
    await client.del(key);
    return null;
  }
  if (parsed.accessTokenExpiresAt > Date.now() + 60_000) return parsed;

  try {
    const tokens = await requestToken(new URLSearchParams({
      grant_type: 'refresh_token', client_id: clientId, refresh_token: parsed.refreshToken,
    }));
    const refreshed: AuthSession = {
      ...parsed,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
    };
    await client.set(key, encrypt(refreshed), { EX: SESSION_TTL_SECONDS });
    return refreshed;
  } catch {
    await client.del(key);
    return null;
  }
}

export async function getSession(sessionId: string | undefined): Promise<AuthSession | null> {
  if (!sessionId) return null;
  return readSession(sessionId);
}

export async function destroySession(sessionId: string | undefined): Promise<void> {
  if (!sessionId || !/^[A-Za-z0-9_-]{40,60}$/.test(sessionId)) return;
  const client = await redis();
  const key = opaqueKey('auth:session', sessionId);
  const saved = await client.getDel(key);
  if (!saved) return;
  const session: unknown = decrypt(saved);
  if (!isSession(session)) return;
  const config = endpoints();
  await fetch(config.logout, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, refresh_token: session.refreshToken }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    console.warn(JSON.stringify({ level: 'warn', event: 'identity_logout_revocation_unavailable' }));
  });
}
