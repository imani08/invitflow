import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const tokenPattern = /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/i;

async function forward(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!tokenPattern.test(token)) return NextResponse.json({ error: 'invitation_not_found' }, { status: 404 });
  const method = request.method;
  let body: string | undefined;
  if (method === 'POST') {
    const expected = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
    if (request.headers.get('origin') !== expected) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    const text = await request.text();
    if (text.length > 16_384) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    try { const data: unknown = JSON.parse(text); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); body = text; }
    catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  }
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/public/invitations/${encodeURIComponent(token)}${method === 'POST' ? '/rsvp' : ''}`, { method, ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body } : {}), cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    return NextResponse.json(await response.json().catch(() => ({ error: 'invalid_response' })), { status: response.status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch { return NextResponse.json({ error: 'invitation_service_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}

export const GET = forward;
export const POST = forward;
