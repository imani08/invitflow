import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { cookieOptions, EmailVerificationRequiredError, finishLogin, getSession, sessionCookieName } from '@/lib/auth-session';
import { getDefaultPostLoginDestination } from '@/components/app-navbar-items.mjs';

export const runtime = 'nodejs';

function publicUrl(path: string) {
  return new URL(path, process.env['WEB_ORIGIN'] ?? 'http://localhost:3000');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  try {
    if (!code || !state || code.length > 4096 || !/^[A-Za-z0-9_-]{30,100}$/.test(state)) {
      throw new Error('Callback code or state is missing or invalid');
    }
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

    const errorDetails = error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: 'unknown', message: 'Unknown callback error' };
    console.error('[AUTH CALLBACK ERROR]', errorDetails);

    try {
      const cookieStore = await cookies();
      const existingSession = await getSession(cookieStore.get(sessionCookieName())?.value);
      if (existingSession) {
        const response = NextResponse.redirect(publicUrl('/'));
        response.headers.set('Cache-Control', 'no-store');
        return response;
      }
    } catch (sessionError) {
      console.error('[AUTH CALLBACK SESSION CHECK ERROR]', sessionError instanceof Error
        ? { name: sessionError.name, message: sessionError.message }
        : { name: 'unknown', message: 'Unknown session check error' });
    }

    const response = NextResponse.redirect(publicUrl('/?auth=failed'));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
