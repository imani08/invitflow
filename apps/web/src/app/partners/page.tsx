import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import AppNavbar from '@/components/AppNavbar';
import { PartnerDashboard, type Dashboard } from './partner-dashboard';
import '../events/journey.css';
import './partners.css';

export const dynamic = 'force-dynamic';

export default async function PartnersPage() {
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Fpartners');
  const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/partners/me`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }).catch(() => null);
  const data: unknown = await response?.json().catch(() => null);
  const dashboard = isDashboard(data) ? data : null;
  const publicWebUrl = process.env['PUBLIC_WEB_URL'] ?? process.env['WEB_ORIGIN'] ?? 'http://localhost:3000';
  const referralUrl = dashboard ? buildReferralUrl(publicWebUrl, dashboard.partner.code) : '';
  const notRegistered = response?.status === 404;
  return <main className="partner-page events-shell"><AppNavbar area="partner"/><header className="partner-page-header"><span>ESPACE PARTENAIRE</span><h1>Votre activité<br/><em>partenaire.</em></h1><p>Suivez les attributions et commissions réellement enregistrées pour votre code.</p></header>{response?.ok && dashboard ? <PartnerDashboard data={dashboard} referralUrl={referralUrl}/> : <section className="partner-unavailable"><h2>{notRegistered ? 'Profil partenaire non activé' : 'Données temporairement indisponibles'}</h2><p>{notRegistered ? 'Aucun profil partenaire actif n’est rattaché à ce compte.' : 'Le service partenaire n’a pas pu charger votre espace. Réessayez lorsque le service sera disponible.'}</p></section>}</main>;
}

function buildReferralUrl(origin: string, code: string) {
  try {
    const base = new URL(origin);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') return '';
    return new URL(`/referral?code=${encodeURIComponent(code)}`, base).toString();
  } catch {
    return '';
  }
}

function isDashboard(value: unknown): value is Dashboard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Partial<Dashboard>;
  return !!data.partner && typeof data.partner.code === 'string' && typeof data.partner.status === 'string'
    && Number.isSafeInteger(data.clients) && Number.isSafeInteger(data.sales)
    && Array.isArray(data.commissions) && Array.isArray(data.history) && Array.isArray(data.payouts);
}
