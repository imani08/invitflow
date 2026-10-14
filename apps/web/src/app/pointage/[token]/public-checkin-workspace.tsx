'use client';

import { useEffect, useState } from 'react';
import { CheckInWorkspace } from '../../events/[eventId]/check-in/workspace';

type Context = { eventName: string; reference: string; expiresAt: string; ceremonies: { id: string; name: string; startAt?: string }[] };

export function PublicCheckInWorkspace({ token }: { token: string }) {
  const [context, setContext] = useState<Context | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`/api/public/check-in-links/${encodeURIComponent(token)}/context`, { cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(async (response) => ({ response, body: await response.json().catch(() => null) }))
      .then(({ response, body }) => { if (!live) return; if (!response.ok) { setError(body?.message ?? 'Ce lien de pointage n’est plus disponible.'); return; } setContext(body as Context); })
      .catch(() => { if (live) setError('Le pointage est momentanément indisponible.'); });
    return () => { live = false; };
  }, [token]);

  if (error) return <section className="check-card"><h1>Pointage indisponible</h1><p>{error}</p></section>;
  if (!context) return <section className="check-card"><p>Chargement du pointage sécurisé…</p></section>;
  return <><header><p>ACCUEIL DES INVITÉS</p><h1>{context.eventName}</h1><span>{context.reference} · valable jusqu’au {new Date(context.expiresAt).toLocaleDateString('fr-FR')}</span></header><CheckInWorkspace eventId="public-link" ceremonies={context.ceremonies} isOwner={false} scanEndpoint={`/api/public/check-in-links/${encodeURIComponent(token)}/scan`} showSummary={false} hideCeremonySelector={context.ceremonies.length === 1} /></>;
}
