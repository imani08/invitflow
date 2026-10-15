import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import AppNavbar from '@/components/AppNavbar';
import { formatDate, formatDateTime } from '@/lib/date-format.mjs';
import { PaymentActions } from './payment-actions';
import '../../events/journey.css';
import './wallet.css';
import { journeyDestination } from '@/lib/journey-draft-policy.mjs';

type Balance = { availableCredits: number; reservedCredits: number; totalCredits: number; updatedAt: string };
type Entry = { id: string; type: string; availableDelta: number; reservedDelta: number; referenceType: string | null; referenceId: string | null; createdAt: string };
type Pack = { id: string; key: string; name: string; credits: number; checkInEvents: number; checkInGuestCapacity: number; priceMinor: number; currency: string };
type Catalog = { version: number; effectiveAt: string; packs: Pack[]; rules: { operation: string; creditCost: number; unit: string }[] };
type Payment = { id: string; status: string; provider: string; checkoutUrl: string | null; failureCode: string | null; createdAt: string; mockConfirmationAvailable: boolean; order: { packName: string; credits: number; amountMinor: number; currency: string; priceScheduleVersion: number } };
type CheckInLicense = { id: string; source: 'PERSONAL' | 'AGENCY'; status: string; eventId: string | null; guestCapacity: number; usedGuestCount: number };

export const dynamic = 'force-dynamic';

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; missing?: string }> }) {
  const store = await cookies();
  const query = await searchParams;
  const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Faccount%2Fwallet');
  const gateway = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';
  let journeyReturn = journeyDestination(query.returnTo ?? store.get('invitaflow-journey-return')?.value);
  if (journeyReturn?.eventId) {
    try {
      const event = await fetch(`${gateway}/v1/events/${journeyReturn.eventId}`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6000) });
      if (!event.ok) journeyReturn = null;
    } catch { journeyReturn = null; }
  }
  const returnLink = journeyReturn ? <a className="wallet-checkout" href={journeyReturn.path}>Reprendre mon événement</a> : null;
  let balanceResponse: Response; let entriesResponse: Response; let pricingResponse: Response; let paymentsResponse: Response; let licensesResponse: Response;
  try {
    [balanceResponse, entriesResponse, pricingResponse, paymentsResponse, licensesResponse] = await Promise.all([
      fetch(`${gateway}/v1/wallet/me`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
      fetch(`${gateway}/v1/wallet/me/transactions?limit=50`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
      fetch(`${gateway}/v1/pricing`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
      fetch(`${gateway}/v1/payments/me`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
      fetch(`${gateway}/v1/check-in/licenses`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6_000) }),
    ]);
  } catch {
    return <Unavailable returnLink={returnLink} />;
  }
  if ([balanceResponse, entriesResponse, pricingResponse, paymentsResponse, licensesResponse].some((response) => response.status === 401)) redirect('/api/auth/login?returnTo=%2Faccount%2Fwallet');
  if (!balanceResponse.ok || !entriesResponse.ok || !pricingResponse.ok || !paymentsResponse.ok || !licensesResponse.ok) return <Unavailable returnLink={returnLink} />;
  const balance = await balanceResponse.json() as Balance;
  const entriesPayload = await entriesResponse.json() as { items: Entry[] };
  const catalog = await pricingResponse.json() as Catalog;
  const paymentsPayload = await paymentsResponse.json() as { items: Payment[] };
  const licensesPayload = await licensesResponse.json() as { items: CheckInLicense[] };
  if (!Number.isSafeInteger(balance.availableCredits) || !Array.isArray(entriesPayload.items) || !Array.isArray(catalog.packs) || !Number.isInteger(catalog.version) || !Array.isArray(paymentsPayload.items) || !Array.isArray(licensesPayload.items)) return <Unavailable returnLink={returnLink} />;
  const missing = /^\d{1,4}$/.test(query.missing ?? '') ? Math.min(5000, Number(query.missing)) : 0;
  const coveringPack = missing ? [...catalog.packs].filter(pack => pack.credits >= missing).sort((a, b) => a.credits - b.credits)[0] : undefined;

  return <main className="wallet-page events-shell"><AppNavbar />
    {returnLink}
    <header className="wallet-heading"><span className="eyebrow">ESPACE PARTICULIER · PORTEFEUILLE PERSONNEL</span><h1>Crédits & tarifs</h1><p>Vos crédits personnels et vos droits de pointage. Les quotas des espaces Agence sont gérés séparément et ne sont jamais prélevés ici.</p></header>
    <section className="wallet-balance" aria-label="Solde de crédits"><div><span>Crédits disponibles</span><strong>{balance.availableCredits.toLocaleString('fr-FR')} <small>crédits</small></strong></div><div><span>Crédits réservés</span><strong>{balance.reservedCredits.toLocaleString('fr-FR')} <small>crédits</small></strong></div><small>Ce portefeuille contient des crédits, jamais de l’argent. · Mis à jour le {formatDateTime(balance.updatedAt)}</small></section>
    <section className="wallet-section"><div className="wallet-section-title"><div><span className="eyebrow">TARIFS EN VIGUEUR</span><h2>Packs de crédits</h2></div><small>Version {catalog.version} · à partir du {formatDate(catalog.effectiveAt)}</small></div>{coveringPack && <p>Pour couvrir les {missing} crédits manquants annoncés : le pack « {coveringPack.name} » contient {coveringPack.credits} crédits. Le solde sera revérifié avant toute émission.</p>}<PaymentActions packs={catalog.packs} payments={paymentsPayload.items} scheduleVersion={catalog.version} /><p className="wallet-note">Le crédit du portefeuille intervient uniquement après vérification de la transaction par le serveur. Les aperçus et tests sont gratuits ; une invitation personnalisée finale générée coûte {catalog.rules.find((rule) => rule.operation === 'invitation.final.personalized')?.creditCost ?? '—'} crédit.</p></section>
    <section className="wallet-section"><div className="wallet-section-title"><div><span className="eyebrow">DROITS DE POINTAGE PERSONNELS</span><h2>Capacités achetées</h2></div><small>Liens sécurisés partageables, sans comptes d’agents.</small></div>{licensesPayload.items.length ? <div className="wallet-ledger">{licensesPayload.items.map((license) => <article key={license.id}><div><strong>{license.eventId ? 'Droit affecté à un événement' : 'Droit disponible à affecter'}</strong><small>{license.usedGuestCount.toLocaleString('fr-FR')} / {license.guestCapacity.toLocaleString('fr-FR')} invités distincts déjà pointés</small></div><span>{license.status === 'ACTIVE' ? 'Actif' : 'Disponible'}</span></article>)}</div> : <div className="wallet-empty">Aucun droit de pointage personnel acheté. Les droits inclus dans les plans Agence ne sont pas affichés ici.</div>}</section>
    <section className="wallet-section"><div className="wallet-section-title"><div><span className="eyebrow">JOURNAL IMMUTABLE</span><h2>Opérations récentes</h2></div><small>Les corrections apparaissent comme des écritures inverses.</small></div>{entriesPayload.items.length ? <div className="wallet-ledger">{entriesPayload.items.map((entry) => <article key={entry.id}><div><strong>{entryLabel(entry.type)}</strong><small>{formatDateTime(entry.createdAt)}{entry.referenceId ? ` · ${entry.referenceType ?? 'Référence'} ${entry.referenceId}` : ''}</small></div><span className={entry.availableDelta > 0 ? 'ledger-positive' : entry.availableDelta < 0 ? 'ledger-negative' : ''}>{entry.availableDelta > 0 ? '+' : ''}{entry.availableDelta} disponible{entry.reservedDelta ? ` · ${entry.reservedDelta > 0 ? '+' : ''}${entry.reservedDelta} réservé${Math.abs(entry.reservedDelta) > 1 ? 's' : ''}` : ''}</span></article>)}</div> : <div className="wallet-empty">Aucune opération de crédit pour le moment.</div>}</section>
  </main>;
}

function entryLabel(type: string) {
  const labels: Record<string, string> = { PURCHASE: 'Crédits achetés', PROMO: 'Crédits promotionnels', ADMIN_ADJUSTMENT: 'Ajustement', RESERVATION: 'Crédits réservés', CONSUMPTION: 'Crédits consommés', RELEASE: 'Crédits libérés', REVERSAL: 'Écriture corrective' };
  return labels[type] ?? 'Opération de crédit';
}

function Unavailable({ returnLink }: { returnLink?: React.ReactNode }) {
  return <main className="wallet-page events-shell"><AppNavbar />{returnLink}<section className="wallet-unavailable"><span className="eyebrow">VOTRE PORTEFEUILLE</span><h1>Informations momentanément indisponibles</h1><p>Le portefeuille et la grille tarifaire n’ont pas pu être chargés. Réessayez dans quelques instants.</p><a href="/account/wallet">Réessayer</a></section></main>;
}
