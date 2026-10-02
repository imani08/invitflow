'use client';

import { useState } from 'react';

type Entry = { id: string; status: string; orderType: string; baseAmountMinor: number; commissionAmountMinor: number; rateBpsSnapshot: number; currency: string; createdAt: string };
type Payout = { id: string; amountMinor: number; currency: string; status: string; externalReference: string | null; createdAt: string };
type Dashboard = { partner: { code: string; status: string }; clients: number; sales: number; commissions: Array<{ status: string; currency: string; _sum: { commissionAmountMinor: number | null } }>; history: Entry[]; payouts: Payout[] };

export function PartnerDashboard({ data }: { data: Dashboard }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const currencies = [...new Set(data.commissions.filter((row) => row.status === 'PAYABLE' && (row._sum.commissionAmountMinor ?? 0) > 0).map((row) => row.currency))];
  const [payoutCurrency, setPayoutCurrency] = useState(currencies[0] ?? '');
  async function requestPayout() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/partners/me/payouts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currency: payoutCurrency }) });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result && typeof result === 'object' && 'message' in result && typeof result.message === 'string' ? result.message : 'La demande n’a pas abouti.');
      setMessage('Demande de payout créée. Elle doit être validée par l’administration.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Service indisponible.'); }
    finally { setBusy(false); }
  }
  const amounts = data.commissions.map((row) => <article key={`${row.status}-${row.currency}`}><span>{row.status} · {row.currency}</span><strong>{((row._sum.commissionAmountMinor ?? 0) / 100).toLocaleString('fr-FR')}</strong></article>);
  return <>
    <section className="partner-summary"><div><small>CODE PARTENAIRE</small><h2>{data.partner.code}</h2><p>État : {data.partner.status}</p><a href={`/referral?code=${encodeURIComponent(data.partner.code)}`}>Lien d’attribution →</a><p>Partagez ce lien; les ventes éligibles sont rattachées au code et les commissions suivent leur statut dans le ledger.</p></div><div className="partner-counts"><article><span>Clients attribués</span><strong>{data.clients}</strong></article><article><span>Ventes confirmées</span><strong>{data.sales}</strong></article>{amounts}</div></section>
    {message && <p role="status">{message}</p>}
    <section><div className="partner-heading"><div><h2>Commissions</h2><p>PENDING : enregistrée, pas encore disponible. PAYABLE : disponible pour demande de paiement. PAID : paiement confirmé. REVERSED : annulée ou compensée après remboursement/chargeback.</p></div><div>{currencies.length > 1 && <select aria-label="Devise du payout" value={payoutCurrency} onChange={(event) => setPayoutCurrency(event.target.value)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select>}<button onClick={() => void requestPayout()} disabled={busy || data.partner.status !== 'ACTIVE' || !payoutCurrency}>{busy ? 'Envoi…' : 'Demander un payout'}</button></div></div>{data.history.length ? <div className="partner-table-wrap"><table><thead><tr><th>Date</th><th>Commande</th><th>Base</th><th>Taux snapshot</th><th>Commission</th><th>État</th></tr></thead><tbody>{data.history.map((entry) => <tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleDateString('fr-FR')}</td><td>{entry.orderType}</td><td>{(entry.baseAmountMinor / 100).toLocaleString('fr-FR')} {entry.currency}</td><td>{(entry.rateBpsSnapshot / 100).toLocaleString('fr-FR')}%</td><td>{(entry.commissionAmountMinor / 100).toLocaleString('fr-FR')} {entry.currency}</td><td>{entry.status}</td></tr>)}</tbody></table></div> : <p>Aucune commission pour le moment. Les commissions apparaîtront lorsqu’un client attribué aura effectué un paiement éligible confirmé.</p>}</section>
    <section><h2>Historique des payouts</h2>{data.payouts.length ? <ul>{data.payouts.map((payout) => <li key={payout.id}>{(payout.amountMinor / 100).toLocaleString('fr-FR')} {payout.currency} · {payout.status}{payout.externalReference ? ` · ${payout.externalReference}` : ''}{payout.status === 'PAID' && ' · Confirmation vérifiée'}</li>)}</ul> : <p>Aucun payout demandé. Vous pourrez demander un payout lorsque des commissions PAYABLE seront disponibles.</p>}<p>Un payout n’est marqué PAID qu’après réception d’une confirmation vérifiable du prestataire.</p></section>
  </>;
}
