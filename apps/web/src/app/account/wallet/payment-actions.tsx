'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatDateTime } from '@/lib/date-format.mjs';
import Link from 'next/link';

type Pack = { id: string; key: string; name: string; credits: number; priceMinor: number; currency: string };
type Payment = { id: string; status: string; provider: string; checkoutUrl: string | null; failureCode: string | null; createdAt: string; mockConfirmationAvailable: boolean; order: { packName: string; credits: number; amountMinor: number; currency: string; priceScheduleVersion: number } };
type PaymentChannel = 'CARD_ONLY' | 'MOBILE_MONEY_ONLY' | 'CARD_AND_MOBILE_MONEY';

export function PaymentActions({ packs, payments, scheduleVersion }: { packs: Pack[]; payments: Payment[]; scheduleVersion: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null);
  const [channel, setChannel] = useState<PaymentChannel>('CARD_AND_MOBILE_MONEY');
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [pollError, setPollError] = useState('');
  const inFlight = useRef(false);
  const idempotencyKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const pending = payments.filter((payment) => ['CREATED', 'PROCESSING', 'PENDING'].includes(payment.status));
    if (!pending.length) return;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch('/api/payments/me', { cache: 'no-store' });
        if (!response.ok) throw new Error('Statut temporairement indisponible');
        const payload = await response.json() as { items?: Payment[] };
        if (!Array.isArray(payload.items)) throw new Error('Réponse invalide');
        if (!active) return;
        setPollError('');
        const latest = new Map(payload.items.map((payment) => [payment.id, payment]));
        if (pending.some((payment) => {
          const updated = latest.get(payment.id);
          return updated && (updated.status !== payment.status || updated.checkoutUrl !== payment.checkoutUrl);
        })) router.refresh();
      } catch {
        if (active) setPollError('Actualisation du statut momentanément indisponible. La confirmation serveur reste en cours.');
      }
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [payments, router]);

  async function buy(pack: Pack, paymentChannel: PaymentChannel) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(pack.id); setMessage('');
    try {
      const idempotencySlot = `${pack.id}:${paymentChannel}`;
      const idempotencyKey = idempotencyKeys.current.get(idempotencySlot) ?? crypto.randomUUID();
      idempotencyKeys.current.set(idempotencySlot, idempotencyKey);
      const response = await fetch('/api/payments', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify({ packId: pack.id, channel: paymentChannel, salesTermsAccepted: legalAccepted, refundPolicyAccepted: legalAccepted }) });
      const payment = await response.json() as Payment & { error?: string };
      if (!response.ok) throw new Error(payment.error === 'LEGAL_TERMS_NOT_ACCEPTED' ? 'Veuillez accepter les CGV et la politique de remboursement pour continuer.' : payment.error === 'payments_service_unavailable' ? 'Le service de paiement est momentanément indisponible.' : 'La commande n’a pas pu être créée. Réessayez.');
      idempotencyKeys.current.delete(idempotencySlot);
      if (payment.checkoutUrl) { window.location.assign(payment.checkoutUrl); return; }
      if (payment.mockConfirmationAvailable) { setMessage(`Commande ${payment.id} créée. Confirmez le paiement de test dans l’historique ci-dessous.`); window.location.reload(); return; }
      setMessage('Commande créée. En attente de la confirmation du prestataire.'); window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'La commande n’a pas pu être créée.'); }
    finally { inFlight.current = false; setBusy(null); }
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
    {pollError && <p className="wallet-payment-message wallet-payment-warning" role="status">{pollError}</p>}
    <div className="wallet-packs">{packs.map((pack) => <article className="wallet-pack" key={pack.id}>
      <span>{pack.name}</span><strong>{pack.credits.toLocaleString('fr-FR')} crédits</strong><b>{formatMoney(pack.priceMinor, pack.currency)}</b>
      <small>Tarif version {scheduleVersion}</small>
      <button type="button" disabled={busy !== null} onClick={() => { setSelectedPack(pack); setChannel('CARD_AND_MOBILE_MONEY'); setLegalAccepted(false); setMessage(''); }}>{busy === pack.id ? 'Préparation…' : 'Choisir ce pack'}</button>
    </article>)}</div>
    {selectedPack && <div className="wallet-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && busy === null) setSelectedPack(null); }}>
      <section className="wallet-confirm" role="dialog" aria-modal="true" aria-labelledby="wallet-confirm-title">
        <span className="eyebrow">RÉCAPITULATIF</span><h2 id="wallet-confirm-title">Confirmer votre achat</h2>
        <dl><div><dt>Pack</dt><dd>{selectedPack.name}</dd></div><div><dt>Crédits ajoutés après confirmation</dt><dd>{selectedPack.credits.toLocaleString('fr-FR')} crédits</dd></div><div><dt>Montant à payer</dt><dd>{formatMoney(selectedPack.priceMinor, selectedPack.currency)}</dd></div></dl>
        <fieldset className="wallet-payment-channels"><legend>Moyen de paiement</legend><label><input type="radio" name="payment-channel" checked={channel === 'CARD_AND_MOBILE_MONEY'} onChange={() => setChannel('CARD_AND_MOBILE_MONEY')} />Carte ou Mobile Money</label><label><input type="radio" name="payment-channel" checked={channel === 'CARD_ONLY'} onChange={() => setChannel('CARD_ONLY')} />Carte bancaire</label><label><input type="radio" name="payment-channel" checked={channel === 'MOBILE_MONEY_ONLY'} onChange={() => setChannel('MOBILE_MONEY_ONLY')} />Mobile Money</label></fieldset>
        <p>Les crédits seront ajoutés uniquement après confirmation du paiement par le serveur.</p>
        <p className="wallet-legal-consent"><label><input type="checkbox" checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} />J’accepte les <Link href="/legal/cgv" target="_blank" rel="noreferrer">Conditions Générales de Vente</Link> et la <Link href="/legal/remboursements" target="_blank" rel="noreferrer">Politique de remboursement</Link>.</label></p>
        <div className="wallet-confirm-actions"><button type="button" className="wallet-cancel" disabled={busy !== null} onClick={() => { setSelectedPack(null); setLegalAccepted(false); }}>Retour</button><button type="button" disabled={busy !== null || !legalAccepted} onClick={() => void buy(selectedPack, channel)}>{busy === selectedPack.id ? 'Création sécurisée…' : 'Continuer vers le paiement'}</button></div>
      </section>
    </div>}
    <section className="wallet-orders"><div className="wallet-section-title"><div><span className="eyebrow">COMMANDES</span><h2>Historique des paiements</h2></div><small>Le portefeuille est crédité après vérification côté serveur.</small></div>
      {payments.length ? <div className="wallet-ledger">{payments.map((payment) => <article key={payment.id}><div><strong>{payment.order.packName} · {paymentStatusLabel(payment.status)}</strong><small>{formatDateTime(payment.createdAt)} · {payment.order.credits.toLocaleString('fr-FR')} crédits · {formatMoney(payment.order.amountMinor, payment.order.currency)}</small></div>
        {payment.checkoutUrl && ['PENDING', 'PROCESSING', 'CREATED'].includes(payment.status) ? <a className="wallet-checkout" href={payment.checkoutUrl}>Continuer le paiement</a> : payment.mockConfirmationAvailable ? <button type="button" className="wallet-test-confirm" disabled={busy !== null} onClick={() => void confirmMock(payment.id)}>{busy === payment.id ? 'Confirmation…' : 'Confirmer le paiement de test (dev)'}</button> : <span>{payment.status === 'SUCCEEDED' ? 'Confirmation reçue · crédits vérifiés au prochain chargement' : payment.failureCode ?? (['FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'REFUND_PENDING'].includes(payment.status) ? 'Consulter le support si nécessaire' : 'Mise à jour automatique')}</span>}</article>)}</div> : <div className="wallet-empty">Aucune commande pour le moment.</div>}
    </section>
  </>;
}

function paymentStatusLabel(status: string) {
  const labels: Record<string, string> = { CREATED: 'Initiation', PROCESSING: 'En cours', PENDING: 'En attente', SUCCEEDED: 'Confirmé', FAILED: 'Échoué', CANCELLED: 'Annulé', EXPIRED: 'Expiré', REFUND_PENDING: 'Remboursement en cours', REFUNDED: 'Remboursé' };
  return labels[status] ?? 'Statut transmis par le service de paiement';
}

function formatMoney(priceMinor: number, currency: string) {
  const digits = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(priceMinor / (10 ** digits));
}
