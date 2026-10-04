'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Entry = { id: string; status: string; orderType: string; baseAmountMinor: number; commissionAmountMinor: number; rateBpsSnapshot: number; currency: string; createdAt: string };
type Payout = { id: string; amountMinor: number; currency: string; status: string; externalReference: string | null; createdAt: string };
export type Dashboard = { partner: { code: string; status: string }; clients: number; sales: number; commissions: Array<{ status: string; currency: string; _sum: { commissionAmountMinor: number | null } }>; history: Entry[]; payouts: Payout[] };

const commissionStatus: Record<string, string> = { PENDING: 'En attente de validation', VALIDATED: 'Validée', PAYABLE: 'À régler', PAID: 'Réglée', REVERSED: 'Inversée', DISPUTED: 'Contestée' };
const payoutStatus: Record<string, string> = { PENDING: 'Demande reçue', APPROVED: 'Approuvée', PROCESSING: 'En traitement', PAID: 'Payée', REJECTED: 'Refusée' };
const orderType: Record<string, string> = { CREDIT_PURCHASE: 'Achat de crédits', AGENCY_SUBSCRIPTION: 'Abonnement agence' };

export function PartnerDashboard({ data, referralUrl }: { data: Dashboard; referralUrl: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [payoutCurrency, setPayoutCurrency] = useState('');
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);
  const payableCurrencies = [...new Set(data.commissions.filter((row) => row.status === 'PAYABLE' && (row._sum.commissionAmountMinor ?? 0) > 0).map((row) => row.currency))];
  const selectedCurrency = payoutCurrency && payableCurrencies.includes(payoutCurrency) ? payoutCurrency : payableCurrencies[0] ?? '';

  async function requestPayout() {
    if (inFlight.current || !selectedCurrency) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/partners/me/payouts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currency: selectedCurrency }) });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result && typeof result === 'object' && 'message' in result && typeof result.message === 'string' ? result.message : 'La demande n’a pas abouti.');
      setMessage('Demande de règlement créée. Elle apparaît dans l’historique et doit être traitée par l’administration.');
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Service indisponible.'); }
    finally { inFlight.current = false; setBusy(false); }
  }

  async function copyReferralLink() {
    try { await navigator.clipboard.writeText(referralUrl); setCopied(true); setMessage('Lien partenaire copié.'); setTimeout(() => setCopied(false), 2400); }
    catch { setMessage('Copie indisponible. Sélectionnez et copiez le lien affiché.'); }
  }

  return <>
    <section className="partner-summary" id="attributions" aria-label="Aperçu partenaire">
      <div className="partner-profile"><small>PARTENARIAT COMMERCIAL</small><h2>{data.partner.code}</h2><p className="partner-status">Statut : <strong>{partnerStatus(data.partner.status)}</strong></p>{referralUrl ? <><label htmlFor="partner-referral-link">Lien d’attribution</label><div className="partner-link-row"><input id="partner-referral-link" value={referralUrl} readOnly onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void copyReferralLink()}>{copied ? 'Copié' : 'Copier le lien'}</button></div></> : <p role="status">Le lien d’attribution n’est pas disponible : l’adresse publique du site est mal configurée.</p>}<p>Les commandes éligibles de clients rattachés au code peuvent générer des commissions selon leur statut de validation.</p></div>
      <div className="partner-counts"><article><span>Clients attribués</span><strong>{data.clients.toLocaleString('fr-FR')}</strong></article><article><span>Ventes confirmées</span><strong>{data.sales.toLocaleString('fr-FR')}</strong></article></div>
    </section>

    {message && <p role="status" className="partner-feedback">{message}</p>}

    <section className="partner-section" id="commissions"><div className="partner-section-heading"><div><small>LEDGER COMMISSIONS</small><h2>Commissions</h2><p>Les sommes affichées sont des montants de commission en devise; elles ne sont pas des crédits InvitaFlow.</p></div></div>
      {data.commissions.length ? <div className="partner-commission-summary">{data.commissions.map((row) => <article key={`${row.status}-${row.currency}`}><span>{commissionStatus[row.status] ?? row.status} · {row.currency}</span><strong>{formatMinor(row._sum.commissionAmountMinor ?? 0, row.currency)}</strong></article>)}</div> : <p className="partner-empty">Aucune commission enregistrée.</p>}
      <div className="partner-history-heading"><h3>Historique des commissions</h3><span>{data.history.length} écriture(s)</span></div>
      {data.history.length ? <div className="partner-table-wrap"><table><thead><tr><th>Date</th><th>Commande éligible</th><th>Montant commande</th><th>Taux enregistré</th><th>Commission</th><th>Statut</th></tr></thead><tbody>{data.history.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleDateString('fr-FR')}</td><td>{orderType[entry.orderType] ?? 'Commande'}</td><td>{formatMinor(entry.baseAmountMinor, entry.currency)}</td><td>{(entry.rateBpsSnapshot / 100).toLocaleString('fr-FR')} %</td><td>{formatMinor(entry.commissionAmountMinor, entry.currency)}</td><td><span className={`partner-status-tag status-${entry.status.toLowerCase()}`}>{commissionStatus[entry.status] ?? entry.status}</span></td></tr>)}</tbody></table></div> : <p className="partner-empty">Aucune écriture pour le moment. Les commandes attribuées apparaîtront après confirmation et calcul côté serveur.</p>}
    </section>

    <section className="partner-section" id="payouts"><div className="partner-section-heading"><div><small>RÈGLEMENTS</small><h2>Demandes et paiements</h2><p>Une demande de règlement n’est pas un paiement effectué. Seule une confirmation externe vérifiée peut passer le statut à Payée.</p></div></div>
      {payableCurrencies.length > 0 && <div className="partner-payout-request"><div><strong>Commissions réglables</strong><span>Les montants finaux sont vérifiés et réservés par le serveur.</span></div>{payableCurrencies.length > 1 && <label>Devise<select aria-label="Devise du règlement" value={selectedCurrency} onChange={(event) => setPayoutCurrency(event.target.value)}>{payableCurrencies.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>}<button type="button" onClick={() => void requestPayout()} disabled={busy || data.partner.status !== 'ACTIVE'}>{busy ? 'Création…' : 'Demander un règlement'}</button></div>}
      {data.payouts.length ? <div className="partner-table-wrap"><table><thead><tr><th>Date</th><th>Montant demandé</th><th>Statut</th><th>Référence externe</th></tr></thead><tbody>{data.payouts.map((payout) => <tr key={payout.id}><td>{new Date(payout.createdAt).toLocaleDateString('fr-FR')}</td><td>{formatMinor(payout.amountMinor, payout.currency)}</td><td><span className={`partner-status-tag status-${payout.status.toLowerCase()}`}>{payoutStatus[payout.status] ?? payout.status}</span></td><td>{payout.externalReference ?? '—'}</td></tr>)}</tbody></table></div> : <p className="partner-empty">Aucune demande de règlement enregistrée.</p>}
      {!payableCurrencies.length && <p className="partner-note">Aucune commission payable n’est signalée par le ledger.</p>}
    </section>
  </>;
}

function partnerStatus(status: string) {
  const labels: Record<string, string> = { ACTIVE: 'Actif', PENDING: 'En attente', SUSPENDED: 'Suspendu' };
  return labels[status] ?? status;
}

function formatMinor(amountMinor: number, currency: string) {
  const digits = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amountMinor / (10 ** digits));
}
