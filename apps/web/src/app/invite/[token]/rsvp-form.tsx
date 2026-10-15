'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Ceremony = { id: string; name: string; startAt: string | null };
type Invitation = { guestName: string; event: { name: string; startAt: string | null; location: string }; ceremonies: Ceremony[] };

// RSVP data is retained for history, but the public invitation journey is now read-only.
export function RsvpForm({ token }: { token: string }) {
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [message, setMessage] = useState('Chargement de votre invitation…');
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    fetch(`/api/public/invitations/${encodeURIComponent(token)}`, { cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(async (response) => {
        const data = await response.json() as Invitation;
        if (!response.ok) {
          if (response.status === 404 || response.status === 410) throw new Error('Cette invitation est introuvable ou n’est plus valide.');
          if (response.status >= 500) throw new Error('Le service est temporairement indisponible. Réessayez dans quelques instants.');
          throw new Error('Cette invitation ne peut pas être affichée.');
        }
        setInvite(data); setError(false); setMessage('');
      })
      .catch((cause: unknown) => { setError(true); setMessage(cause instanceof Error ? cause.message : 'Invitation indisponible.'); });
  }, [token, retryKey]);

  if (!invite) return <section className="rsvp-card"><p className={error ? 'rsvp-message is-error' : 'rsvp-message'} role={error ? 'alert' : 'status'}>{message}</p>{error && <button type="button" className="rsvp-retry" onClick={() => { setError(false); setMessage('Chargement de votre invitation…'); setRetryKey((value) => value + 1); }}>Réessayer</button>}</section>;
  return <section className="rsvp-card">
    <p className="rsvp-eyebrow">VOTRE INVITATION</p>
    <h1>{invite.event.name}</h1>
    <p>Bonjour {invite.guestName}, nous serons heureux de vous accueillir.</p>
    {invite.event.startAt && <p>{new Date(invite.event.startAt).toLocaleString('fr-FR')}</p>}
    {invite.event.location && <p>{invite.event.location}</p>}
    {invite.ceremonies.length > 0 && <div className="rsvp-list">{invite.ceremonies.map((ceremony) => <article key={ceremony.id}><h2>{ceremony.name}</h2>{ceremony.startAt && <p>{new Date(ceremony.startAt).toLocaleString('fr-FR')}</p>}</article>)}</div>}
    <p className="rsvp-message">Cette invitation ne demande pas de confirmation de présence.</p>
    <p className="rsvp-privacy-link"><Link href="/legal/invites">Confidentialité des invités</Link></p>
  </section>;
}
