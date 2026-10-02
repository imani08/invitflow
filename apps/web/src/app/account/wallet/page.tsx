import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { BrandLogo } from '@/components/brand-logo';
import { PaymentActions } from './payment-actions';
import './wallet.css';

type Balance = { availableCredits: number; reservedCredits: number; totalCredits: number; updatedAt: string };
type Entry = { id: string; type: string; availableDelta: number; reservedDelta: number; referenceType: string | null; referenceId: string | null; createdAt: string };
type Pack = { id: string; key: string; name: string; credits: number; priceMinor: number; currency: string };
type Catalog = { version: number; effectiveAt: string; packs: Pack[]; rules: { operation: string; creditCost: number; unit: string }[] };
type Payment = { id: string; status: string; provider: string; checkoutUrl: string | null; failureCode: string | null; createdAt: string; mockConfirmationAvailable: boolean; order: { packName: string; credits: number; amountMinor: number; currency: string; priceScheduleVersion: number } };

export const dynamic = 'force-dynamic';

export default async function WalletPage() {
  const store = await cookies();
  const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Faccount%2Fwallet');
  const gateway = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';
  let balanceResponse: Response; let entriesResponse: Response; let pricingResponse: Response; let paymentsResponse: Response;
  try {
    [balanceResponse, entriesResponse, pricingResponse, paymentsResponse] = await Promise.all([
      fetch(`${gateway}/v1/wallet/me`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
      fetch(`${gateway}/v1/wallet/me/transactions?limit=50`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
      fetch(`${gateway}/v1/pricing`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
      fetch(`${gateway}/v1/payments/me`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
    ]);
  } catch {
    return <Unavailable />;
  }
  if ([balanceResponse, entriesResponse, pricingResponse, paymentsResponse].some((response) => response.status === 401)) redirect('/api/auth/login?returnTo=%2Faccount%2Fwallet');
  if (!balanceResponse.ok || !entriesResponse.ok || !pricingResponse.ok || !paymentsResponse.ok) return <Unavailable />;
  const balance = await balanceResponse.json() as Balance;
  const entriesPayload = await entriesResponse.json() as { items: Entry[] };
  const catalog = await pricingResponse.json() as Catalog;
  const paymentsPayload = await paymentsResponse.json() as { items: Payment[] };
  if (!Number.isSafeInteger(balance.availableCredits) || !Array.isArray(entriesPayload.items) || !Array.isArray(catalog.packs) || !Number.isInteger(catalog.version) || !Array.isArray(paymentsPayload.items)) return <Unavailable />;

  return <main className="wallet-page"><nav className="account-nav"><BrandLogo/><div><a className="account-link" href="/account">Mon compte</a><a className="account-link" href="/account/notifications">Notifications</a><a className="account-link" href="/events">Mes événements</a></div></nav>
    <header className="wallet-heading"><span className="eyebrow">VOTRE PORTEFEUILLE</span><h1>Crédits & tarifs</h1><p>Consultez le solde réel de votre portefeuille et la grille tarifaire en vigueur.</p></header>
    <section className="wallet-balance" aria-label="Solde de crédits"><div><span>Crédits disponibles</span><strong>{balance.availableCredits.toLocaleString('fr-FR')}</strong></div><div><span>Crédits réservés</span><strong>{balance.reservedCredits.toLocaleString('fr-FR')}</strong></div><small>Grille tarifaire version {catalog.version} · mise à jour du portefeuille {new Date(balance.updatedAt).toLocaleString('fr-FR')}</small></section>
    <section className="wallet-section"><div className="wallet-section-title"><div><span className="eyebrow">TARIFS EN VIGUEUR</span><h2>Packs de crédits</h2></div><small>Version {catalog.version} · à partir du {new Date(catalog.effectiveAt).toLocaleDateString('fr-FR')}</small></div><PaymentActions packs={catalog.packs} payments={paymentsPayload.items} scheduleVersion={catalog.version} /><p className="wallet-note">Le crédit du portefeuille intervient uniquement après vérification de la transaction par le serveur. Les aperçus et tests sont gratuits ; une invitation personnalisée finale générée coûte {catalog.rules.find((rule) => rule.operation === 'invitation.final.personalized')?.creditCost ?? '—'} crédit.</p></section>
    <section className="wallet-section"><div className="wallet-section-title"><div><span className="eyebrow">JOURNAL IMMUTABLE</span><h2>Opérations récentes</h2></div><small>Les corrections apparaissent comme des écritures inverses.</small></div>{entriesPayload.items.length ? <div className="wallet-ledger">{entriesPayload.items.map((entry) => <article key={entry.id}><div><strong>{entryLabel(entry.type)}</strong><small>{new Date(entry.createdAt).toLocaleString('fr-FR')}{entry.referenceId ? ` · ${entry.referenceType ?? 'Référence'} ${entry.referenceId}` : ''}</small></div><span className={entry.availableDelta > 0 ? 'ledger-positive' : entry.availableDelta < 0 ? 'ledger-negative' : ''}>{entry.availableDelta > 0 ? '+' : ''}{entry.availableDelta} disponible{entry.reservedDelta ? ` · ${entry.reservedDelta > 0 ? '+' : ''}${entry.reservedDelta} réservé${Math.abs(entry.reservedDelta) > 1 ? 's' : ''}` : ''}</span></article>)}</div> : <div className="wallet-empty">Aucune opération de crédit pour le moment.</div>}</section>
  </main>;
}

function entryLabel(type: string) {
  const labels: Record<string, string> = { PURCHASE: 'Crédits achetés', PROMO: 'Crédits promotionnels', ADMIN_ADJUSTMENT: 'Ajustement', RESERVATION: 'Crédits réservés', CONSUMPTION: 'Crédits consommés', RELEASE: 'Crédits libérés', REVERSAL: 'Écriture corrective' };
  return labels[type] ?? 'Opération de crédit';
}

function Unavailable() {
  return <main className="wallet-page"><nav className="account-nav"><BrandLogo/><div><a className="account-link" href="/account">Mon compte</a></div></nav><section className="wallet-unavailable"><span className="eyebrow">VOTRE PORTEFEUILLE</span><h1>Informations momentanément indisponibles</h1><p>Le portefeuille et la grille tarifaire n’ont pas pu être chargés. Réessayez dans quelques instants.</p><a href="/account/wallet">Réessayer</a></section></main>;
}
