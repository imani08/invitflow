import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from '@/lib/auth-session';

export const runtime = 'nodejs';

async function forward(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  if (request.method !== 'GET') return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
  const { path = [] } = await context.params;
  if (!(path.length === 1 && path[0] === 'me') && !(path.length === 2 && path[0] === 'me' && path[1] === 'transactions')) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const suffix = path.map((part) => encodeURIComponent(part)).join('/');
  const url = new URL(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/wallet/${suffix}`);
  url.search = new URL(request.url).search;
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) });
    const payload = await response.json().catch(() => ({ error: 'invalid_wallet_response' }));
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'wallet_service_unavailable' }, { status: 503 }); }
}

export const GET = forward;
