import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from '@/lib/auth-session';

export const runtime = 'nodejs';

async function forward(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const isList = request.method === 'GET' && path.length === 0;
  const isReadAll = request.method === 'POST' && path.length === 1 && path[0] === 'read-all';
  const isPreferences = (request.method === 'GET' || request.method === 'POST') && path.length === 1 && path[0] === 'preferences';
  const isReadOne = request.method === 'PATCH' && path.length === 2 && /^[0-9a-f-]{36}$/i.test(path[0] ?? '') && path[1] === 'read';
  if (!isList && !isReadAll && !isPreferences && !isReadOne) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (request.method !== 'GET' && request.headers.get('origin') !== (process.env['WEB_ORIGIN'] ?? 'http://localhost:3000')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const store = await cookies();
  const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: string | undefined;
  if (request.method === 'POST' && !isReadAll) {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    body = await request.text();
    if (body.length > 4_096) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    try { JSON.parse(body); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  }
  const suffix = path.map((part) => encodeURIComponent(part)).join('/');
  const query = new URL(request.url).search;
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/notifications${suffix ? `/${suffix}` : ''}${query}`, {
      method: request.method, headers: { authorization: `Bearer ${session.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body } : {}), cache: 'no-store', signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => ({ error: 'invalid_notifications_response' }));
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'notifications_service_unavailable' }, { status: 503 }); }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
