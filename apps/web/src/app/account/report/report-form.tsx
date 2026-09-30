'use client';
import { useRef, useState, type FormEvent } from 'react';

export function ReportForm() {
  const idempotency = useRef(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const formElement = event.currentTarget; setBusy(true); setMessage(''); if (!idempotency.current) idempotency.current = crypto.randomUUID();
    const form = new FormData(formElement); const body = { resourceType: form.get('resourceType'), resourceId: String(form.get('resourceId') ?? '').trim(), reasonCode: form.get('reasonCode'), description: String(form.get('description') ?? '').trim() };
    try { const response = await fetch('/api/moderation/reports', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotency.current }, body: JSON.stringify(body), cache: 'no-store' }); const result = await response.json(); if (!response.ok) throw new Error(result.message ?? 'Le signalement n’a pas pu être envoyé.'); idempotency.current = ''; formElement.reset(); setMessage('Signalement envoyé. Merci de nous aider à examiner ce contenu.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Le signalement n’a pas pu être envoyé.'); } finally { setBusy(false); }
  };
  return <form className="report-form" onSubmit={submit}><label>Type de contenu<select name="resourceType"><option value="EVENT">Événement</option><option value="GUEST">Fiche invité</option><option value="INVITATION">Invitation</option></select></label><label>Identifiant du contenu<input name="resourceId" required pattern="[0-9a-fA-F-]{36}" maxLength={36} placeholder="UUID du contenu" /></label><label>Motif<select name="reasonCode"><option value="INAPPROPRIATE_CONTENT">Contenu inapproprié</option><option value="FRAUD">Fraude</option><option value="HARASSMENT">Harcèlement</option><option value="OTHER">Autre</option></select></label><label>Description<textarea name="description" required minLength={10} maxLength={1000} rows={5} placeholder="Expliquez brièvement ce qui devrait être examiné." /></label><button disabled={busy}>{busy ? 'Envoi…' : 'Envoyer le signalement'}</button>{message && <p role="status">{message}</p>}</form>;
}
