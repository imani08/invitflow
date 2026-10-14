import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
const opaqueToken = /^[A-Za-z0-9_-]{43}$/;

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!opaqueToken.test(token)) return NextResponse.json({ message: 'Lien de pointage invalide.' }, { status: 404 });
  try {
    const gateway = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';
    const response = await fetch(`${gateway}/v1/public/check-in-links/${encodeURIComponent(token)}/context`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    const body = await response.json().catch(() => ({ message: 'Réponse de pointage invalide.' }));
    return NextResponse.json(body, { status: response.status, headers: { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' } });
  } catch {
    return NextResponse.json({ message: 'Le service de pointage est momentanément indisponible.' }, { status: 503 });
  }
}
