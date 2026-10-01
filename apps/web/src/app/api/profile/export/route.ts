import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { AccountExportError, collectAccountExport } from '@/lib/account-export.mjs';

export const runtime = 'nodejs';

export async function GET() {
  const exportedAt = new Date().toISOString();
  try {
    const cookieStore = await cookies();
    const session = await getSession(cookieStore.get(sessionCookieName())?.value);
    if (!session)
      return NextResponse.json(
        { error: 'unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    const document = await collectAccountExport({
      accessToken: session.accessToken,
      gateway: process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002',
      exportedAt,
    });
    return new NextResponse(JSON.stringify(document, null, 2), {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="invitaflow-account-${exportedAt.slice(0, 10)}.json"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const status = error instanceof AccountExportError ? error.status : 503;
    const code = error instanceof AccountExportError ? error.code : 'account_data_unavailable';
    return NextResponse.json(
      { error: code },
      { status, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
