import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';
export default async function ReferralPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = '' } = await searchParams;
  if (!/^[A-Za-z0-9_-]{3,60}$/.test(code)) return <main><h1>Code partenaire invalide</h1></main>;
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/referral?code=${code}`)}`);
  const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/partners/attributions`, { method: 'POST', headers: { authorization: `Bearer ${session.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ code, source: 'LINK' }), cache: 'no-store', signal: AbortSignal.timeout(6_000) }).catch(() => null);
  const payload: unknown = await response?.json().catch(() => null);
  const succeeded = response?.ok;
  const message = succeeded ? 'Le parrainage est enregistré pour votre compte.' : payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' ? payload.message : 'Le code n’a pas pu être appliqué.';
  return <main className="partner-page"><nav><a href="/account">← Mon compte</a></nav><section><span>CODE PARTENAIRE</span><h1>{code}</h1><p role="status">{message}</p></section></main>;
}
