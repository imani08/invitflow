import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { BrandLogo } from '@/components/brand-logo';
import { PartnerDashboard } from './partner-dashboard';
import './partners.css';

export const dynamic = 'force-dynamic';

export default async function PartnersPage() {
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Fpartners');
  const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/partners/me`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }).catch(() => null);
  const data: unknown = await response?.json().catch(() => null);
  return <main className="partner-page"><nav><BrandLogo variant="compact"/><a href="/account">← Mon compte</a></nav><header><span>PARTENAIRES</span><h1>Votre activité partenaire</h1><p>Les indicateurs et commissions affichés viennent du registre de paiement.</p></header>{response?.ok && data && typeof data === 'object' ? <PartnerDashboard data={data as never}/> : <section><h2>Tableau partenaire indisponible</h2><p>Ce compte n’a pas encore de profil partenaire actif, ou le service est temporairement indisponible.</p></section>}</main>;
}
