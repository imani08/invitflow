import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from '@/lib/auth-session';

export const runtime = 'nodejs';

async function forward(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const isList = request.method === 'GET' && path.length === 1 && path[0] === 'me';
  const isCreate = request.method === 'POST' && path.length === 0;
  const isStatus = request.method === 'GET' && path.length === 1 && /^[0-9a-f-]{36}$/i.test(path[0] ?? '');
  const isMockConfirm = request.method === 'POST' && path.length === 2 && /^[0-9a-f-]{36}$/i.test(path[0] ?? '') && path[1] === 'mock-confirm';
  if (!isList && !isCreate && !isStatus && !isMockConfirm) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (request.method !== 'GET' && request.headers.get('origin') !== (process.env['WEB_ORIGIN'] ?? 'http://localhost:3000')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let body: string | undefined;
  if (isCreate) {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    const raw = await request.text();
    if (raw.length > 16 * 1024) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    try { const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 }); }
    catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
    body = raw;
  }
  const suffix = path.map((part) => encodeURIComponent(part)).join('/');
  const target = isCreate ? '/v1/payments' : `/v1/payments/${suffix}`;
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}${target}`, {
      method: request.method,
      headers: { authorization: `Bearer ${session.accessToken}`, ...(body ? { 'content-type': 'application/json', 'idempotency-key': request.headers.get('idempotency-key') ?? '' } : {}) },
      ...(body ? { body } : {}), cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({ error: 'invalid_payments_response' }));
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'payments_service_unavailable' }, { status: 503 }); }
}

export const GET = forward;
export const POST = forward;
