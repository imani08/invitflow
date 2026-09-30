import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from '@/lib/auth-session';

export const runtime = 'nodejs';

async function forward(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const expectedOrigin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('origin') !== expectedOrigin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { path = [] } = await context.params;
  const suffix = path.map((part) => encodeURIComponent(part)).join('/');
  const url = new URL(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events${suffix ? `/${suffix}` : ''}`);
  url.search = new URL(request.url).search;
  const method = request.method;
  const isGuestUpload = method === 'POST' && path.length === 2 && path[1] === 'guest-imports';
  const isSeatingUpload = method === 'POST' && path.length === 5 && path[1] === 'ceremonies' && path[3] === 'seating' && path[4] === 'imports';
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  let body: BodyInit | undefined;
  let contentType: string | undefined;
  if (isGuestUpload || isSeatingUpload) {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 5 * 1024 * 1024 + 16_384) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    try {
      const incoming = await request.formData();
      const file = incoming.get('file');
      if (!(file instanceof File) || incoming.getAll('file').length !== 1 || [...incoming.keys()].some((key) => key !== 'file')) return NextResponse.json({ error: 'file_required' }, { status: 400 });
      if (file.size < 1 || file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
      const outgoing = new FormData();
      outgoing.append('file', file, file.name.replace(/[\\/\x00-\x1f]/g, '_').slice(-255));
      body = outgoing;
    } catch {
      return NextResponse.json({ error: 'invalid_upload' }, { status: 400 });
    }
  } else if (hasBody) {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    const maximumBodyLength = path[1] === 'designs' ? 256 * 1024 : path[1] === 'invitations' ? 512 * 1024 : 32_768;
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maximumBodyLength) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    const jsonBody = await request.text();
    if (jsonBody.length > maximumBodyLength) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    try {
      const parsed: unknown = JSON.parse(jsonBody);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 });
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    body = jsonBody;
    contentType = 'application/json';
  }
  try {
    const idempotencyKey = request.headers.get('idempotency-key');
    const response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${session.accessToken}`, ...(contentType ? { 'content-type': contentType } : {}), ...(idempotencyKey && /^[-A-Za-z0-9._:@/]{1,200}$/.test(idempotencyKey) ? { 'idempotency-key': idempotencyKey } : {}) },
      ...(body ? { body } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok && response.headers.get('content-type')?.startsWith('image/png')) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2 * 1024 * 1024) return NextResponse.json({ error: 'preview_too_large' }, { status: 502 });
      return new NextResponse(bytes, { status: response.status, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (response.ok && (response.headers.get('content-type')?.startsWith('application/pdf') || response.headers.get('content-type')?.startsWith('application/zip'))) {
      const headers = new Headers({ 'Content-Type': response.headers.get('content-type') ?? 'application/octet-stream', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      const disposition = response.headers.get('content-disposition'); if (disposition) headers.set('Content-Disposition', disposition);
      return new NextResponse(response.body, { status: response.status, headers });
    }
    const payload = await response.json().catch(() => ({ error: 'invalid_events_response' }));
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'event_services_unavailable' }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
