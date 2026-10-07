import { NextResponse } from 'next/server';
import { createLoginRedirect } from '@/lib/auth-session';
import { getDefaultPostLoginDestination } from '@/components/app-navbar-items.mjs';

export const runtime = 'nodejs';

function publicUrl(path: string) {
  return new URL(path, process.env['WEB_ORIGIN'] ?? 'http://localhost:3000');
}

export async function GET(request: Request) {
  const requestedReturnTo = new URL(request.url).searchParams.get('returnTo');
  const returnTo = getDefaultPostLoginDestination(requestedReturnTo);
  try {
    const response = NextResponse.redirect(await createLoginRedirect(returnTo));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    const response = NextResponse.redirect(publicUrl('/?auth=unavailable'));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
}
