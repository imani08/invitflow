'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Ceremony = {
  id: string;
  name: string;
  startAt: string | null;
  allowedCompanions: number;
  response: { status: 'ACCEPTED' | 'DECLINED'; attendingCompanions: number; respondedAt?: string } | null;
};
type Invitation = { guestName: string; event: { name: string; startAt: string | null; location: string }; ceremonies: Ceremony[] };
type Answer = { status: 'ACCEPTED' | 'DECLINED'; companions: number };

export function RsvpForm({ token }: { token: string }) {
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [message, setMessage] = useState('Chargement de votre invitation…');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const submitting = useRef(false);

  useEffect(() => {
    fetch(`/api/public/invitations/${encodeURIComponent(token)}`, { cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(async (response) => {
        const data = await response.json() as Invitation;
        if (!response.ok) {
          if (response.status === 404 || response.status === 410) throw new Error('Cette invitation est introuvable ou n’est plus valide.');
          if (response.status >= 500) throw new Error('Le service est temporairement indisponible. Réessayez dans quelques instants.');
          throw new Error('Cette invitation ne peut pas être affichée.');
        }
        setInvite(data);
        setAnswers(Object.fromEntries(data.ceremonies.map((ceremony) => [ceremony.id, {
          status: ceremony.response?.status ?? 'ACCEPTED',
          companions: ceremony.response?.attendingCompanions ?? 0,
        }])));
        setSaved(data.ceremonies.some(ceremony => ceremony.response !== null));
        setError(false);
        setMessage('');
      })
      .catch((error: unknown) => { setError(true); setMessage(error instanceof Error ? error.message : 'Invitation indisponible.'); });
  }, [token, retryKey]);

  const save = async () => {
    if (!invite || submitting.current || busy) return;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/public/invitations/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ responses: invite.ceremonies.map((ceremony) => {
          const answer = answers[ceremony.id] ?? { status: 'ACCEPTED' as const, companions: 0 };
          return {
            ceremonyId: ceremony.id,
            status: answer.status,
            attendingCompanions: answer.status === 'ACCEPTED' ? answer.companions : 0,
          };
        }) }),
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 404 || response.status === 410) throw new Error('Cette invitation n’est plus disponible.');
        if (response.status >= 500) throw new Error('Le service est temporairement indisponible. Vos réponses ne sont pas confirmées. Réessayez.');
        throw new Error(result.message ?? 'Vos réponses n’ont pas été enregistrées.');
      }
      const savedResponses = new Map<string, { status: Answer['status']; attendingCompanions: number; respondedAt?: string }>((result.responses ?? []).map((item: { ceremonyId: string; status: Answer['status']; attendingCompanions: number; respondedAt?: string }) => [item.ceremonyId, item]));
      setInvite(current => current ? { ...current, ceremonies: current.ceremonies.map(ceremony => { const answer = savedResponses.get(ceremony.id); return answer ? { ...ceremony, response: { status: answer.status, attendingCompanions: answer.attendingCompanions, ...(answer.respondedAt ? { respondedAt: answer.respondedAt } : {}) } } : ceremony; }) } : current);
      setSaved(true); setError(false); setMessage('Merci, vos réponses sont enregistrées.');
    } catch (error) {
      setError(true);
      setMessage(error instanceof Error ? error.message : 'Une erreur est survenue.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  if (!invite) return <section className="rsvp-card"><p className={error ? 'rsvp-message is-error' : 'rsvp-message'} role={error ? 'alert' : 'status'}>{message}</p>{error && <button type="button" className="rsvp-retry" onClick={() => { setError(false); setMessage('Chargement de votre invitation…'); setRetryKey(value => value + 1); }}>Réessayer</button>}</section>;
  return (
    <section className="rsvp-card">
      <p className="rsvp-eyebrow">VOTRE INVITATION</p>
      <h1>{invite.event.name}</h1>
      <p>Bonjour {invite.guestName}, indiquez votre présence pour chaque cérémonie à laquelle vous êtes invité(e).</p>
      {invite.event.startAt && <p>{new Date(invite.event.startAt).toLocaleString('fr-FR')}</p>}
      {invite.event.location && <p>{invite.event.location}</p>}
      <div className="rsvp-list">
        {invite.ceremonies.map((ceremony) => {
          const answer = answers[ceremony.id] ?? { status: 'ACCEPTED' as const, companions: 0 };
          return (
            <article key={ceremony.id}>
              <h2>{ceremony.name}</h2>
              {ceremony.startAt && <p>{new Date(ceremony.startAt).toLocaleString('fr-FR')}</p>}
              {ceremony.response && <p className="rsvp-answered">Réponse enregistrée{ceremony.response.respondedAt ? ` le ${new Date(ceremony.response.respondedAt).toLocaleDateString('fr-FR')}` : ''}.</p>}
              <label>Votre réponse
                <select value={answer.status} onChange={(event) => setAnswers((current) => ({
                  ...current,
                  [ceremony.id]: { ...(current[ceremony.id] ?? answer), status: event.target.value as Answer['status'] },
                }))}>
                  <option value="ACCEPTED">Je serai présent(e)</option>
                  <option value="DECLINED">Je ne pourrai pas venir</option>
                </select>
              </label>
              {answer.status === 'ACCEPTED' && ceremony.allowedCompanions > 0 && (
                <label>Accompagnants
                  <select value={answer.companions} onChange={(event) => setAnswers((current) => ({
                    ...current,
                    [ceremony.id]: { ...(current[ceremony.id] ?? answer), companions: Number(event.target.value) },
                  }))}>
                    {Array.from({ length: ceremony.allowedCompanions + 1 }, (_, index) => <option value={index} key={index}>{index}</option>)}
                  </select>
                </label>
              )}
            </article>
          );
        })}
      </div>
      <button disabled={busy || submitting.current} onClick={() => void save()}>{busy ? 'Enregistrement…' : saved ? 'Mettre à jour mes réponses' : 'Confirmer mes réponses'}</button>
      {message && <p className={error ? 'rsvp-message is-error' : 'rsvp-message'} role={error ? 'alert' : 'status'}>{message}</p>}
      <p className="rsvp-privacy-link"><Link href="/legal/invites">Confidentialité des invités</Link></p>
    </section>
  );
}
