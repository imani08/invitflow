import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
const opaqueToken = /^[A-Za-z0-9_-]{43}$/;

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!opaqueToken.test(token)) return NextResponse.json({ message: 'Lien de pointage invalide.' }, { status: 404 });
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 8_192) return NextResponse.json({ message: 'Demande trop volumineuse.' }, { status: 413 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 8_192) return NextResponse.json({ message: 'Demande trop volumineuse.' }, { status: 413 });
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
  } catch {
    return NextResponse.json({ message: 'Données de pointage invalides.' }, { status: 400 });
  }
  try {
    const gateway = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';
    const deviceId = request.headers.get('x-checkin-device-id');
    const response = await fetch(`${gateway}/v1/public/check-in-links/${encodeURIComponent(token)}/scan`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(deviceId ? { 'x-checkin-device-id': deviceId.slice(0, 200) } : {}) }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => ({ message: 'Réponse de pointage invalide.' }));
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer' } });
  } catch {
    return NextResponse.json({ message: 'Le service de pointage est momentanément indisponible.' }, { status: 503 });
  }
}
