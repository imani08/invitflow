import { NextResponse } from 'next/server';
import { createLoginRedirect } from '@/lib/auth-session';

export const runtime = 'nodejs';

function publicUrl(path: string) {
  return new URL(path, process.env['WEB_ORIGIN'] ?? 'http://localhost:3000');
}

export async function GET(request: Request) {
  const requestedReturnTo = new URL(request.url).searchParams.get('returnTo');
  const returnTo = requestedReturnTo && requestedReturnTo.length <= 2048 ? requestedReturnTo : '/account';
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
