import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import { getSession, sessionCookieName } from '@/lib/auth-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function PATCH(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const expectedOrigin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000'; if (request.headers.get('origin') !== expectedOrigin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { reportId } = await context.params; if (!/^[0-9a-f-]{36}$/i.test(reportId)) return NextResponse.json({ error: 'invalid_report_id' }, { status: 400 });
  const store = await cookies(); const session = await getSession(store.get(sessionCookieName())?.value); if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try { const access = decodeJwt(session.accessToken)['realm_access']; const roles = access && typeof access === 'object' && 'roles' in access && Array.isArray(access.roles) ? access.roles : []; if (!roles.some(role => role === 'SUPPORT_ADMIN' || role === 'SUPER_ADMIN')) return NextResponse.json({ error: 'forbidden' }, { status: 403 }); } catch { return NextResponse.json({ error: 'unauthorized' }, { status: 401 }); }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
  const text = await request.text(); if (text.length > 16_384) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  try { const body: unknown = JSON.parse(text); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/admin/moderation-reports/${encodeURIComponent(reportId)}`, { method: 'PATCH', headers: { authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json' }, body: text, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    return NextResponse.json(await response.json().catch(() => ({ error: 'invalid_moderation_response' })), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'audit_service_unavailable' }, { status: 503 }); }
}
