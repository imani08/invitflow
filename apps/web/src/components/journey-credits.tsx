'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
export default function JourneyCredits({ beforeLeave }: { beforeLeave: () => Promise<void> }) {
  const router = useRouter();
  const [credits, setCredits] = useState<number | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setCredits(null); setError('');
    try {
      const response = await fetch('/api/wallet/me', { cache: 'no-store' }), value = await response.json();
      if (!response.ok || !Number.isSafeInteger(value.availableCredits) || value.availableCredits < 0) throw new Error();
      setCredits(value.availableCredits);
    } catch { setError('Solde indisponible.'); }
  }, []);
  useEffect(() => {
    void load(); const visible = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', load); window.addEventListener('invitaflow:wallet-updated', load); document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', load); window.removeEventListener('invitaflow:wallet-updated', load); document.removeEventListener('visibilitychange', visible); };
  }, [load]);
  async function buy() {
    if (busy) return; setBusy(true); setError('');
    try {
      await beforeLeave();
      const response = await fetch('/api/journey-wallet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: location.pathname + location.search + location.hash }), cache: 'no-store' });
      const value = await response.json();
      if (!response.ok || typeof value.href !== 'string' || !value.href.startsWith('/account/wallet?')) throw new Error('Le retour vers votre événement ne peut pas être préparé.');
      router.push(value.href);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Enregistrement impossible. Réessayez avant de quitter.'); }
    finally { setBusy(false); }
  }
  return <aside className="journey-credit-bar" aria-label="Crédits du parcours"><span role="status">{credits === null ? error || 'Chargement des crédits…' : `Crédits disponibles : ${credits.toLocaleString('fr-FR')}`}</span><div>{error && <button onClick={() => void load()}>Actualiser le solde</button>} <button onClick={() => void buy()} disabled={busy}>{busy ? 'Enregistrement…' : 'Acheter des crédits'}</button></div>{error && credits !== null && <p role="alert">{error}</p>}</aside>;
}
