'use client';

import { useState } from 'react';

export function AnnouncementForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const text = String(form.get('message') ?? '').trim();
    if (title.length < 3 || text.length < 3) { setMessage('Saisissez un titre et un message d’au moins 3 caractères.'); return; }
    if (!window.confirm('Envoyer cette annonce à tous les utilisateurs dont l’adresse e-mail est vérifiée ?')) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/notifications/admin/announcements', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, message: text }) });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== 'object' || !Number.isSafeInteger((result as Record<string, unknown>)['queued'])) throw new Error();
      setMessage(`Annonce mise en file pour ${(result as Record<string, number>)['queued']} utilisateur(s).`);
      event.currentTarget.reset();
    } catch { setMessage('L’annonce n’a pas pu être mise en file. Vérifiez vos droits et réessayez.'); }
    finally { setBusy(false); }
  }
  return <form className="admin-panel announcement-form" onSubmit={submit}>
    <div className="admin-panel-head"><div><small>COMMUNICATION GLOBALE</small><h2>Envoyer une annonce</h2></div></div>
    <p>L’annonce sera ajoutée aux notifications et envoyée par e-mail à chaque utilisateur actif dont l’adresse est vérifiée.</p>
    <label>Titre<input name="title" required minLength={3} maxLength={160} placeholder="Ex. Maintenance programmée" disabled={busy} /></label>
    <label>Message<textarea name="message" required minLength={3} maxLength={5000} rows={9} placeholder="Rédigez votre annonce de manière claire et concise." disabled={busy} /></label>
    <button disabled={busy}>{busy ? 'Mise en file…' : 'Envoyer à tous les utilisateurs'}</button>
    {message && <p className="announcement-status" role="status">{message}</p>}
  </form>;
}
