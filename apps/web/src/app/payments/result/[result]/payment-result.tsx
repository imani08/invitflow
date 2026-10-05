'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type PaymentState = { status: string; failureCode?: string | null };
const labels: Record<string, string> = {
  SUCCEEDED: 'Paiement confirmé. Vos crédits sont ajoutés à votre portefeuille.',
  FAILED: 'Le paiement a échoué. Vous pouvez revenir au portefeuille et réessayer.',
  CANCELLED: 'Le paiement a été annulé. Aucun crédit n’a été ajouté.',
  EXPIRED: 'La tentative de paiement a expiré. Vous pouvez réessayer depuis le portefeuille.',
  CREATED: 'La commande est créée. Nous attendons le statut du prestataire.',
  PROCESSING: 'Paiement reçu, confirmation en cours…',
  PENDING: 'Paiement reçu, confirmation en cours…',
  REFUND_PENDING: 'Un remboursement est en cours de traitement.',
  REFUNDED: 'Le paiement a été remboursé.',
};

export function PaymentResult({ result, paymentId }: { result: 'success' | 'cancel' | 'error'; paymentId: string }) {
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [message, setMessage] = useState('Vérification du statut côté serveur…');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const paymentRef = useRef<PaymentState | null>(null);
  const inFlightRef = useRef(false);

  const check = useCallback(async (signal?: AbortSignal) => {
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) { setMessage('La référence du paiement est absente ou invalide.'); return; }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(paymentId)}/status`, { cache: 'no-store', ...(signal ? { signal } : {}) });
      const payload = await response.json() as PaymentState & { error?: string; message?: string };
      if (!response.ok || typeof payload.status !== 'string') throw new Error(payload.message ?? 'Statut momentanément indisponible.');
      paymentRef.current = payload;
      setPayment(payload);
      setMessage(labels[payload.status] ?? 'Statut en cours de vérification.');
    } catch (error) {
      if (!signal?.aborted) setMessage(error instanceof Error ? error.message : 'Statut momentanément indisponible.');
    } finally { inFlightRef.current = false; if (!signal?.aborted) setBusy(false); }
  }, [paymentId]);

  useEffect(() => {
    const controller = new AbortController(); controllerRef.current = controller;
    let tries = 0;
    const tick = () => {
      if (controller.signal.aborted || tries >= 8 || paymentRef.current?.status && !['CREATED', 'PROCESSING', 'PENDING'].includes(paymentRef.current.status)) return;
      tries += 1; setAttempt(tries); void check(controller.signal);
    };
    tick();
    const timer = window.setInterval(tick, 5000);
    return () => { controller.abort(); window.clearInterval(timer); if (controllerRef.current === controller) controllerRef.current = null; };
  }, [check]);

  const title = payment?.status === 'SUCCEEDED' ? 'Paiement confirmé' : result === 'success' ? 'Confirmation du paiement' : result === 'cancel' ? 'Retour du paiement' : 'Vérification du paiement';
  return <main className="events-shell payment-result-page" aria-live="polite" aria-busy={busy}>
    <span className="eyebrow">PORTEFEUILLE INVITAFLOW</span><h1>{title}</h1>
    <p role="status">{message}</p>
    {payment?.status && <p>État vérifié : {payment.status}</p>}
    {!payment && result === 'success' && <p>La page de retour ne confirme pas le paiement. Nous attendons la vérification serveur.</p>}
    {attempt >= 8 && payment && ['CREATED', 'PROCESSING', 'PENDING'].includes(payment.status) && <p>La confirmation peut prendre plus de temps. Revenez ici ou réessayez la vérification.</p>}
    <div className="payment-result-actions"><button type="button" disabled={busy} onClick={() => void check(controllerRef.current?.signal)}>{busy ? 'Vérification…' : 'Vérifier à nouveau'}</button><Link href="/account/wallet">Retour au portefeuille</Link></div>
  </main>;
}
