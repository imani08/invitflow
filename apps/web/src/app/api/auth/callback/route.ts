import { NextResponse } from 'next/server';
import { cookieOptions, EmailVerificationRequiredError, finishLogin, sessionCookieName } from '@/lib/auth-session';
import { getDefaultPostLoginDestination } from '@/components/app-navbar-items.mjs';

export const runtime = 'nodejs';

function publicUrl(path: string) {
  return new URL(path, process.env['WEB_ORIGIN'] ?? 'http://localhost:3000');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || code.length > 4096 || !/^[A-Za-z0-9_-]{30,100}$/.test(state)) {
    const response = NextResponse.redirect(publicUrl('/?auth=failed'));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  try {
    const { sessionId, returnTo } = await finishLogin(code, state);
    console.log('[AUTH SESSION CREATED]', {
  sessionIdLength: sessionId.length,
  cookieName: sessionCookieName(),
  returnTo,
});
    const response = NextResponse.redirect(publicUrl(getDefaultPostLoginDestination(returnTo)));
    response.cookies.set(sessionCookieName(), sessionId, cookieOptions());
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof EmailVerificationRequiredError) {
      const response = NextResponse.redirect(publicUrl('/?auth=verification-required'));
      response.headers.set('Cache-Control', 'no-store');
      return response;
    }
    console.error('[AUTH CALLBACK ERROR]', error instanceof Error ? error.name : 'unknown');

    const response = NextResponse.redirect(publicUrl('/?auth=failed'));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
