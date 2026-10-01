import { NextResponse } from 'next/server';
import { requestOwnProfile } from '@/lib/profile-api';

export const runtime = 'nodejs';

export async function GET() {
  const response = await requestOwnProfile('GET');
  const body = await response.json().catch(() => ({ error: 'invalid_profile_response' }));
  const result = NextResponse.json(body, { status: response.status });
  result.headers.set('Cache-Control', 'no-store');
  return result;
}

export async function PUT(request: Request) {
  const expectedOrigin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
  if (request.headers.get('origin') !== expectedOrigin)
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > 4_096) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return NextResponse.json({ error: 'invalid_profile' }, { status: 400 });
  const data = body as Record<string, unknown>;
  const allowed = ['displayName', 'locale'];
  if (Object.keys(data).some((key) => !allowed.includes(key)))
    return NextResponse.json({ error: 'invalid_profile_fields' }, { status: 400 });
  if (
    data['displayName'] !== undefined &&
    (typeof data['displayName'] !== 'string' ||
      data['displayName'].trim().length < 1 ||
      data['displayName'].trim().length > 100)
  ) {
    return NextResponse.json({ error: 'invalid_display_name' }, { status: 400 });
  }
  if (data['locale'] !== undefined && !['fr', 'en'].includes(String(data['locale'])))
    return NextResponse.json({ error: 'invalid_locale' }, { status: 400 });
  const response = await requestOwnProfile('PUT', JSON.stringify(data));
  const resultBody = await response.json().catch(() => ({ error: 'invalid_profile_response' }));
  const result = NextResponse.json(resultBody, { status: response.status });
  result.headers.set('Cache-Control', 'no-store');
  return result;
}
