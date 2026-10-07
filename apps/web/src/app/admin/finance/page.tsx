import { decodeJwt } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { BrandLogo } from '@/components/brand-logo';
import '../admin.css';

export const dynamic = 'force-dynamic';
type Payment = { id: string; provider: string; providerTransactionId: string | null; status: string; createdAt: string; confirmedAt: string | null; order: { packName: string; credits: number; amountMinor: number; currency: string; priceScheduleVersion: number } };
type PageResult = { items: Payment[]; nextCursor: string | null };

export default async function FinancePaymentsPage({ searchParams }: { searchParams: Promise<{ provider?: string; cursor?: string }> }) {
  const filters = await searchParams;
  const store = await cookies();
  const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent('/admin/finance')}`);

  let roles: string[] = [];
  try {
    const access = decodeJwt(session.accessToken)['realm_access'];
    roles = access && typeof access === 'object' && 'roles' in access && Array.isArray(access.roles) ? access.roles.filter((role): role is string => typeof role === 'string') : [];
  } catch { /* Payments API verifies the signed token independently. */ }
  if (!roles.some((role) => role === 'FINANCE_ADMIN' || role === 'SUPER_ADMIN')) return <main className="admin-shell"><section className="admin-denied"><span>ACCÈS RESTREINT</span><h1>Permission Finance requise</h1><p>Cette page est réservée aux rôles Finance Admin et Super Admin.</p></section></main>;

  const query = new URLSearchParams({ limit: '50' });
  if (filters.provider) query.set('provider', filters.provider);
  if (filters.cursor) query.set('cursor', filters.cursor);
  const base = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';
  let result: PageResult | null = null;
  try {
    const response = await fetch(`${base}/v1/admin/payments?${query}`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (response.ok) result = await response.json() as PageResult;
  } catch { /* Show a service availability message below. */ }

  return <main className="admin-shell">
    <nav><BrandLogo variant="compact" href="/dashboard" /><a href="/admin">← Administration</a><a href="/account">Mon compte</a></nav>
    <header><span>INVITAFLOW · FINANCE</span><h1>Paiements</h1><p>Filtrez par fournisseur et consultez les références de paiement et les montants des commandes.</p></header>
    <section className="admin-panel">
      <form className="admin-filters"><label>Fournisseur<select name="provider" defaultValue={filters.provider ?? ''}><option value="">Tous</option><option value="flexpay">FlexPay</option><option value="cinetpay">CinetPay · historique</option><option value="mock">Mock · développement</option></select></label><button>Filtrer</button></form>
      {result ? result.items.length ? <div className="admin-table-wrap"><table><thead><tr><th>Créé / confirmé</th><th>Fournisseur</th><th>Référence interne</th><th>Référence fournisseur</th><th>Commande</th><th>Montant</th><th>Statut</th></tr></thead><tbody>{result.items.map((payment) => <tr key={payment.id}><td>{new Date(payment.createdAt).toLocaleString('fr-FR')}{payment.confirmedAt && <small>{new Date(payment.confirmedAt).toLocaleString('fr-FR')}</small>}</td><td>{payment.provider.toUpperCase()}</td><td><code>{payment.id}</code></td><td><code>{payment.providerTransactionId ?? '—'}</code></td><td>{payment.order.packName} · {payment.order.credits.toLocaleString('fr-FR')} crédits</td><td>{formatMoney(payment.order.amountMinor, payment.order.currency)}</td><td>{payment.status}</td></tr>)}</tbody></table></div> : <p className="admin-empty">Aucun paiement pour ce filtre.</p> : <p className="admin-empty">L’API des paiements n’a pas pu répondre.</p>}
      {result?.nextCursor && <a className="admin-next" href={`/admin/finance?${new URLSearchParams({ ...(filters.provider ? { provider: filters.provider } : {}), cursor: result.nextCursor })}`}>Charger la page suivante →</a>}
    </section>
  </main>;
}

function formatMoney(amountMinor: number, currency: string) {
  const fractionDigits = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amountMinor / (10 ** fractionDigits));
}
