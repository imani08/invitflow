'use client';

import { useState } from 'react';

type Pack = { id: string; key: string; name: string; credits: number; priceMinor: number; currency: string };
type Payment = { id: string; status: string; provider: string; checkoutUrl: string | null; failureCode: string | null; createdAt: string; mockConfirmationAvailable: boolean; order: { packName: string; credits: number; amountMinor: number; currency: string; priceScheduleVersion: number } };

export function PaymentActions({ packs, payments, scheduleVersion }: { packs: Pack[]; payments: Payment[]; scheduleVersion: number }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function buy(pack: Pack) {
    setBusy(pack.id); setMessage('');
    try {
      const response = await fetch('/api/payments', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: JSON.stringify({ packId: pack.id }) });
      const payment = await response.json() as Payment & { error?: string };
      if (!response.ok) throw new Error(payment.error === 'payments_service_unavailable' ? 'Le service de paiement est momentanément indisponible.' : 'La commande n’a pas pu être créée. Réessayez.');
      if (payment.checkoutUrl) { window.location.assign(payment.checkoutUrl); return; }
      if (payment.mockConfirmationAvailable) { setMessage(`Commande ${payment.id} créée. Confirmez le paiement de test dans l’historique ci-dessous.`); window.location.reload(); return; }
      setMessage('Commande créée. En attente de la confirmation du prestataire.'); window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'La commande n’a pas pu être créée.'); }
    finally { setBusy(null); }
  }

  async function confirmMock(paymentId: string) {
    setBusy(paymentId); setMessage('');
    try {
      const response = await fetch(`/api/payments/${paymentId}/mock-confirm`, { method: 'POST' });
      if (!response.ok) throw new Error('Le paiement de test n’a pas pu être confirmé.');
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Le paiement de test n’a pas pu être confirmé.'); setBusy(null); }
  }

  return <>
    {message && <p className="wallet-payment-message" role="status">{message}</p>}
    <div className="wallet-packs">{packs.map((pack) => <article className="wallet-pack" key={pack.id}>
      <span>{pack.name}</span><strong>{pack.credits.toLocaleString('fr-FR')} crédits</strong><b>{formatMoney(pack.priceMinor, pack.currency)}</b>
      <small>Tarif version {scheduleVersion}</small>
      <button type="button" disabled={busy !== null} onClick={() => void buy(pack)}>{busy === pack.id ? 'Préparation…' : 'Acheter ce pack'}</button>
    </article>)}</div>
    <section className="wallet-orders"><div className="wallet-section-title"><div><span className="eyebrow">COMMANDES</span><h2>Historique des paiements</h2></div><small>Le portefeuille est crédité après vérification côté serveur.</small></div>
      {payments.length ? <div className="wallet-ledger">{payments.map((payment) => <article key={payment.id}><div><strong>{payment.order.packName} · {payment.status === 'SUCCEEDED' ? 'Payé' : payment.status === 'REFUNDED' ? 'Remboursé' : payment.status === 'REFUND_PENDING' ? 'Remboursement en cours' : payment.status === 'FAILED' ? 'Échoué' : payment.status === 'PROCESSING' ? 'En cours' : 'En attente'}</strong><small>{new Date(payment.createdAt).toLocaleString('fr-FR')} · {payment.order.credits.toLocaleString('fr-FR')} crédits · {formatMoney(payment.order.amountMinor, payment.order.currency)}</small></div>
        {payment.checkoutUrl && payment.status !== 'SUCCEEDED' ? <a className="wallet-checkout" href={payment.checkoutUrl}>Reprendre le paiement</a> : payment.mockConfirmationAvailable ? <button type="button" className="wallet-test-confirm" disabled={busy !== null} onClick={() => void confirmMock(payment.id)}>{busy === payment.id ? 'Confirmation…' : 'Confirmer le paiement de test (dev)'}</button> : <span>{payment.status === 'SUCCEEDED' ? 'Confirmation reçue' : payment.failureCode ?? 'En attente du prestataire'}</span>}</article>)}</div> : <div className="wallet-empty">Aucune commande pour le moment.</div>}
    </section>
  </>;
}

function formatMoney(priceMinor: number, currency: string) {
  const digits = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(priceMinor / (10 ** digits));
}
