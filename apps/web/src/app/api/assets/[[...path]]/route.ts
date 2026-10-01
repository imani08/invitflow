import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from '@/lib/auth-session';

export const runtime = 'nodejs';

async function forward(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  if (!['GET', 'POST', 'DELETE'].includes(request.method))
    return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
  if (
    request.method !== 'GET' &&
    request.headers.get('origin') !== (process.env['WEB_ORIGIN'] ?? 'http://localhost:3000')
  )
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { path = [] } = await context.params;
  const isCreate = path.length === 0 && request.method === 'POST';
  const isList = path.length === 0 && request.method === 'GET';
  const isRead = path.length === 1 && request.method === 'GET';
  const isDelete = path.length === 1 && request.method === 'DELETE';
  const isAction =
    path.length === 2 &&
    request.method === 'POST' &&
    ['upload-url', 'complete', 'download-url'].includes(path[1] ?? '');
  if (
    !(isCreate || isList || isRead || isDelete || isAction) ||
    path.some((part) => part.length > 100)
  )
    return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: string | undefined;
  if (isCreate) {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
      return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > 16_384)
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    body = await request.text();
    if (Buffer.byteLength(body) > 16_384)
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    try {
      const value: unknown = JSON.parse(body);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 });
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
  }

  const suffix = path.map((part) => encodeURIComponent(part)).join('/');
  const url = new URL(
    `${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/assets${suffix ? `/${suffix}` : ''}`,
  );
  url.search = new URL(request.url).search;
  try {
    const response = await fetch(url, {
      method: request.method,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => ({ error: 'invalid_media_response' }));
    return NextResponse.json(payload, {
      status: response.status,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'media_service_unavailable' }, { status: 503 });
  }
}

export const GET = forward;
export const POST = forward;
export const DELETE = forward;
