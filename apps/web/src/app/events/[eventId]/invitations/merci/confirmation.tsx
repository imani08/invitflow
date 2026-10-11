'use client';
import { useEffect, useState } from 'react';
import { confirmationState } from '@/lib/invitation-confirmation.mjs';

type Batch = { id: string; status: string; completedItems: number; failedItems: number; zipExpiresAt?: string | null; zipDeletedAt?: string | null };
export function InvitationConfirmation({ eventId, eventName, batchId }: { eventId: string; eventName: string; batchId?: string | undefined }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const base = `/events/${encodeURIComponent(eventId)}`;
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setBatch(null);
    void (async () => {
      try {
        if (batchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId)) throw new Error('Lot invalide. Retrouvez vos lots enregistrés.');
        const response = await fetch(`/api${base}/invitations/batches${batchId ? `/${encodeURIComponent(batchId)}` : ''}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Impossible de vérifier le lot. Réessayez ou consultez vos lots.');
        const data: unknown = await response.json();
        const selected = batchId ? data : Array.isArray(data) ? data.find(item => confirmationState(item) === 'ready') ?? data[0] : null;
        if (!selected || typeof selected !== 'object' || typeof selected.id !== 'string' || typeof selected.status !== 'string' || !Number.isSafeInteger(selected.completedItems) || !Number.isSafeInteger(selected.failedItems)) throw new Error('Aucun lot vérifiable. Consultez la génération de vos invitations.');
        if (!controller.signal.aborted) setBatch(selected as Batch);
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Confirmation indisponible.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [base, batchId, attempt]);
  const state = confirmationState(batch);
  return <section className="invitation-panel invitation-confirmation" aria-labelledby="confirmation-title">
    <p className="eyebrow">VOTRE ÉVÉNEMENT · {eventName}</p>
    <h1 id="confirmation-title">{loading ? 'Vérification de vos invitations…' : state === 'ready' ? 'Merci ! Vos invitations sont prêtes.' : 'Retrouvons vos invitations'}</h1>
    <p>Vous pouvez revenir à votre événement à tout moment. Les données enregistrées sont conservées.</p>
    {loading ? <p role="status">Lecture du statut réel du lot…</p> : error ? <p role="alert">{error}</p> : <>
      {state === 'ready' && <p>{batch!.completedItems} PDF prêts{batch!.failedItems ? ` · ${batch!.failedItems} en échec : consultez le détail du lot avant diffusion` : ''}. Téléchargez votre ZIP et vérifiez vos invitations avant de les partager.</p>}
      {state === 'pending' && <p role="status">La génération est encore en cours. Suivez sa progression dans vos lots ; aucun nouveau paiement n’est lancé ici.</p>}
      {state === 'expired' && <p role="status">Ce ZIP a expiré ou a été supprimé. Retrouvez les possibilités de régénération dans vos lots.</p>}
      {state === 'failed' && <p role="alert">Ce lot n’est pas terminé. Consultez son statut et les erreurs avant de réessayer.</p>}
    </>}
    <div className="invitation-actions">
      {!loading && !error && state === 'ready' && <a className="invitation-download" href={`/api${base}/invitations/batches/${encodeURIComponent(batch!.id)}/download`} onClick={() => setDownloadRequested(true)}>Télécharger le ZIP</a>}
      <a className="invitation-download" href={base}>Revenir à mon événement</a>
      <a href={`${base}/invitations`}>← Génération et lots</a>
      {(!loading && (error || state !== 'ready')) && <button className="invitation-link-button" onClick={() => setAttempt(value => value + 1)}>Réessayer la vérification</button>}
    </div>
    {downloadRequested && <p role="status">Téléchargement demandé au navigateur. Cette page ne peut pas confirmer l’enregistrement du fichier sur votre appareil.</p>}
  </section>;
}
