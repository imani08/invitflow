import { decodeJwt } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { BrandLogo } from '@/components/brand-logo';
import { PriceScheduleForm, type Catalog } from './price-schedule-form';
import './pricing.css';

export const dynamic = 'force-dynamic';

export default async function PricingAdminPage() {
  const store = await cookies();
  const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Fadmin%2Fpricing');
  let roles: string[] = [];
  try {
    const access = decodeJwt(session.accessToken)['realm_access'];
    roles = access && typeof access === 'object' && 'roles' in access && Array.isArray(access.roles) ? access.roles.filter((role): role is string => typeof role === 'string') : [];
  } catch { /* Billing independently validates the signed token and role. */ }
  if (!roles.some((role) => role === 'FINANCE_ADMIN' || role === 'SUPER_ADMIN')) return <main className="pricing-admin"><a href="/account">← Mon compte</a><section className="pricing-denied"><span>ACCÈS RESTREINT</span><h1>Permission financière requise</h1><p>La gestion des tarifs est réservée aux rôles Finance Admin et Super Admin.</p></section></main>;
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/admin/price-schedules`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) });
    if (!response.ok) throw new Error('catalog_unavailable');
    const catalog = await response.json() as Catalog;
    return <main className="pricing-admin"><nav><BrandLogo variant="compact"/><a href="/account">← Mon compte</a><a href="/account/wallet">Packs visibles par les clients</a></nav><header><span>BACK-OFFICE · TARIFICATION</span><h1>Grilles de crédits</h1><p>La version {catalog.version} est en vigueur depuis le {new Date(catalog.effectiveAt).toLocaleString('fr-FR')}. Publiez une nouvelle version à une date future ; les anciennes grilles restent immuables.</p></header><PriceScheduleForm catalog={catalog} /></main>;
  } catch {
    return <main className="pricing-admin"><a href="/account">← Mon compte</a><section className="pricing-denied"><span>BACK-OFFICE · TARIFICATION</span><h1>La grille tarifaire est indisponible</h1><p>Le service Billing n’a pas pu charger ses données persistées.</p></section></main>;
  }
}
