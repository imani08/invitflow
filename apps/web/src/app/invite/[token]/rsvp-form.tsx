'use client';

import { useEffect, useState } from 'react';

type Ceremony = {
  id: string;
  name: string;
  startAt: string | null;
  allowedCompanions: number;
  response: { status: 'ACCEPTED' | 'DECLINED'; attendingCompanions: number } | null;
};
type Invitation = { guestName: string; event: { name: string; startAt: string | null; location: string }; ceremonies: Ceremony[] };
type Answer = { status: 'ACCEPTED' | 'DECLINED'; companions: number };

export function RsvpForm({ token }: { token: string }) {
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [message, setMessage] = useState('Chargement de votre invitation…');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/public/invitations/${encodeURIComponent(token)}`, { cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(async (response) => {
        const data = await response.json() as Invitation;
        if (!response.ok) throw new Error('Cette invitation est introuvable ou n’est plus valide.');
        setInvite(data);
        setAnswers(Object.fromEntries(data.ceremonies.map((ceremony) => [ceremony.id, {
          status: ceremony.response?.status ?? 'ACCEPTED',
          companions: ceremony.response?.attendingCompanions ?? 0,
        }])));
        setMessage('');
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Invitation indisponible.'));
  }, [token]);

  const save = async () => {
    if (!invite) return;
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
      if (!response.ok) throw new Error(result.message ?? 'Vos réponses n’ont pas été enregistrées.');
      setMessage('Merci, vos réponses sont enregistrées.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Une erreur est survenue.');
    } finally {
      setBusy(false);
    }
  };

  if (!invite) return <section className="rsvp-card"><p role="status">{message}</p></section>;
  return (
    <section className="rsvp-card">
      <p className="rsvp-eyebrow">VOTRE INVITATION</p>
      <h1>{invite.event.name}</h1>
      <p>Bonjour {invite.guestName}, indiquez votre présence pour chaque cérémonie.</p>
      {invite.event.startAt && <p>{new Date(invite.event.startAt).toLocaleString('fr-FR')}</p>}
      {invite.event.location && <p>{invite.event.location}</p>}
      <div className="rsvp-list">
        {invite.ceremonies.map((ceremony) => {
          const answer = answers[ceremony.id] ?? { status: 'ACCEPTED' as const, companions: 0 };
          return (
            <article key={ceremony.id}>
              <h2>{ceremony.name}</h2>
              {ceremony.startAt && <p>{new Date(ceremony.startAt).toLocaleString('fr-FR')}</p>}
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
      <button disabled={busy} onClick={() => void save()}>{busy ? 'Enregistrement…' : 'Confirmer mes réponses'}</button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
