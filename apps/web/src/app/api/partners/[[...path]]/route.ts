import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from '@/lib/auth-session';

export const runtime = 'nodejs';

async function forward(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const origin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== origin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { path = [] } = await context.params;
  if (path.length > 3 || path.some((part) => !/^[A-Za-z0-9._-]{1,200}$/.test(part))) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const allowed = request.method === 'GET' && path.length === 1 && path[0] === 'me'
    || request.method === 'POST' && ((path.length === 1 && path[0] === 'attributions') || (path.length === 2 && path[0] === 'me' && path[1] === 'payouts'));
  if (!allowed) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let body: string | undefined;
  if (request.method === 'POST') {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    body = await request.text();
    if (body.length > 16_384) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    try { const value: unknown = JSON.parse(body); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  }
  const suffix = path.map(encodeURIComponent).join('/');
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/partners/${suffix}`, { method: request.method, headers: { authorization: `Bearer ${session.accessToken}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body } : {}), cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    return NextResponse.json(await response.json().catch(() => ({ error: 'invalid_partner_response' })), { status: response.status, headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'payments_service_unavailable' }, { status: 503 }); }
}

export const GET = forward;
export const POST = forward;
