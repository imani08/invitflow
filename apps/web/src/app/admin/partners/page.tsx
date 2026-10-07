import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { BrandLogo } from '@/components/brand-logo';
import { PartnerAdminConsole } from './partner-admin-console';
import './partners-admin.css';

export const dynamic = 'force-dynamic';
const gateway = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';
export default async function PartnerAdminPage() {
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Fadmin%2Fpartners');
  const headers = { authorization: `Bearer ${session.accessToken}` };
  const [partnerResponse, ledgerResponse, payoutResponse, attributionResponse, auditResponse] = await Promise.all([
    fetch(`${gateway}/v1/admin/partners`, { headers, cache: 'no-store' }).catch(() => null),
    fetch(`${gateway}/v1/admin/partners/ledger`, { headers, cache: 'no-store' }).catch(() => null),
    fetch(`${gateway}/v1/admin/partners/payouts`, { headers, cache: 'no-store' }).catch(() => null),
    fetch(`${gateway}/v1/admin/partners/attributions`, { headers, cache: 'no-store' }).catch(() => null),
    fetch(`${gateway}/v1/admin/partners/audit`, { headers, cache: 'no-store' }).catch(() => null),
  ]);
  const read = async (response: Response | null) => response?.ok ? response.json().catch(() => null) : null;
  const [partners, ledger, payouts, attributions, audit] = await Promise.all([read(partnerResponse), read(ledgerResponse), read(payoutResponse), read(attributionResponse), read(auditResponse)]);
  const denied = [partnerResponse, ledgerResponse, payoutResponse, attributionResponse, auditResponse].some((response) => response?.status === 403);
  return <main className="partner-admin"><nav><BrandLogo variant="compact" href="/dashboard" /><a href="/admin/pricing">← Tarification</a></nav><header><span>OPERATIONS · FINANCE</span><h1>Partenaires & commissions</h1><p>Gérez les codes, règles de commission, écritures et paiements partenaires.</p></header>{denied ? <section><h2>Accès Finance requis</h2><p>Votre compte n’a pas l’autorisation d’administrer les partenaires.</p></section> : <PartnerAdminConsole initialPartners={Array.isArray(partners) ? partners : []} initialLedger={Array.isArray(ledger) ? ledger : []} initialPayouts={Array.isArray(payouts) ? payouts : []} initialAttributions={Array.isArray(attributions) ? attributions : []} initialAudit={Array.isArray(audit) ? audit : []}/>}</main>;
}
