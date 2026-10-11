import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { journeyDestination } from '@/lib/journey-draft-policy.mjs';
import { isExpectedOrigin } from '@/lib/same-origin.mjs';
export async function POST(request: Request) {
  if (!isExpectedOrigin(request.headers.get('origin'), process.env['WEB_ORIGIN'] ?? 'http://localhost:3000')) return NextResponse.json({}, { status: 403 });
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) return NextResponse.json({}, { status: 401 });
  const text = await request.text();
  if (text.length > 2048) return NextResponse.json({}, { status: 413 });
  let input: { path?: unknown; missing?: unknown };
  try { input = JSON.parse(text); } catch { return NextResponse.json({}, { status: 400 }); }
  const destination = journeyDestination(input.path);
  if (!destination) return NextResponse.json({}, { status: 400 });
  if (destination.eventId) {
    try {
      const event = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events/${destination.eventId}`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!event.ok) return NextResponse.json({}, { status: event.status === 403 || event.status === 404 ? 403 : 503 });
    } catch { return NextResponse.json({}, { status: 503 }); }
  }
  const missing = Number.isSafeInteger(input.missing) && Number(input.missing) > 0 && Number(input.missing) <= 5000 ? Number(input.missing) : 0;
  const query = new URLSearchParams({ returnTo: destination.path, ...(missing ? { missing: String(missing) } : {}) });
  const response = NextResponse.json({ href: `/account/wallet?${query}` }, { headers: { 'Cache-Control': 'private, no-store' } });
  response.cookies.set('invitaflow-journey-return', destination.path, { httpOnly: true, secure: process.env['NODE_ENV'] === 'production', sameSite: 'lax', path: '/account/wallet', maxAge: 30 * 24 * 60 * 60 });
  return response;
}
