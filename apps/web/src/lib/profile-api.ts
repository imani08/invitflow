import 'server-only';
import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from './auth-session';

export async function requestOwnProfile(
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
  body?: string,
  suffix = '',
) {
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const gateway = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';
  try {
    return await fetch(`${gateway}/v1/profile/me${suffix ? `/${suffix}` : ''}`, {
      method,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        ...(['PUT', 'POST'].includes(method) ? { 'content-type': 'application/json' } : {}),
      },
      ...(['PUT', 'POST'].includes(method) && body !== undefined ? { body } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return Response.json({ error: 'profile_unavailable' }, { status: 503 });
  }
}
