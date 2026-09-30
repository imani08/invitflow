import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession, cookieOptions, sessionCookieName } from '@/lib/auth-session';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const expectedOrigin = process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
  if (request.headers.get('origin') !== expectedOrigin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(sessionCookieName())?.value;
  try {
    await destroySession(sessionId);
  } catch {
    // Expire the browser cookie even if the identity provider is unavailable.
  }
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(sessionCookieName(), '', { ...cookieOptions(), maxAge: 0 });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
