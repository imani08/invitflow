import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import AppNavbar from '@/components/AppNavbar';
import { AgencyWorkspace, type Agency, type AgencyPlan } from './workspace';
import './agency.css';

export const dynamic = 'force-dynamic';
const gateway = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';

export default async function AgenciesPage() {
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Fagencies');
  const headers = { authorization: `Bearer ${session.accessToken}` };
  let agencies: Agency[] = [];
  let plans: AgencyPlan[] = [];
  let unavailable = false;
  try {
    const [agencyResponse, planResponse] = await Promise.all([
      fetch(`${gateway}/v1/agencies`, { headers, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
      fetch(`${gateway}/v1/pricing?segment=AGENCY`, { headers, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
    ]);
    if (!agencyResponse.ok) throw new Error('agency');
    const payload: unknown = await agencyResponse.json();
    if (Array.isArray(payload)) agencies = payload as Agency[];
    if (planResponse.ok) {
      const catalog: unknown = await planResponse.json();
      if (catalog && typeof catalog === 'object' && Array.isArray((catalog as { packs?: unknown }).packs)) plans = (catalog as { packs: AgencyPlan[] }).packs.filter((plan) => plan.segment === 'AGENCY');
    }
  } catch { unavailable = true; }
  return <main className="agency-shell"><AppNavbar /><header><span>ESPACE AGENCE</span><h1>Vos clients,<br/><em>vos événements.</em></h1><p>Suivez les membres, clients, événements et crédits à partir des données du workspace.</p></header>{unavailable ? <section className="agency-message"><h2>Service agence indisponible</h2><p>Réessayez lorsque les services et la base seront disponibles.</p><a href="/agencies">Réessayer</a></section> : <AgencyWorkspace initialAgencies={agencies} plans={plans}/>}</main>;
}
