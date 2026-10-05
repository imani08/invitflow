'use client';

import { canApplyEditorial, editorialSelectionRequest } from '@/lib/editorial-assist.mjs';
import { useEffect, useRef, useState } from 'react';

type Job = { id: string; baseVersion: number; status: string; errorCode?: string; editorial?: { sourceText: string; proposedText: string; fits: boolean } | null };
export default function EditorialAssist({ eventId, designId, sourceVersion, elementId, sourceText, dirty, onAccepted, onTemplate }: {
  eventId: string; designId: string; sourceVersion: number; elementId: string; sourceText: string; dirty: boolean; onAccepted: () => Promise<void>; onTemplate: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  const [level, setLevel] = useState('BALANCED');
  const [language, setLanguage] = useState('fr');
  const [tone, setTone] = useState('preserve');
  const [terms, setTerms] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manualText, setManualText] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const base = `/api/events/${encodeURIComponent(eventId)}/designs/${encodeURIComponent(designId)}`;
  const stale = dirty || (!!job && job.baseVersion !== sourceVersion);
  useEffect(() => {
    if (!opened) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [opened]);
  async function request(path: string, method: string, body?: unknown) {
    const response = await fetch(base + path, { method, cache: 'no-store', ...(body !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.message === 'string' ? payload.message : 'Assistance indisponible. Votre original reste intact.');
    return payload;
  }
  useEffect(() => {
    if (!opened || !job || !['QUEUED', 'PROCESSING'].includes(job.status)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(base + '/ai-jobs/' + job.id, { cache: 'no-store', signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error('Suivi de la proposition indisponible.');
        const next = await response.json() as Job;
        if (!controller.signal.aborted) setJob(next);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Suivi indisponible.'); });
    }, 2000);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [opened, job, base]);
  async function generate() {
    setBusy(true); setError('');
    try {
      const next = await request('/ai-jobs', 'POST', { workflow: 'EDITORIAL_COMPRESSION', elementId, sourceVersion, language, tone, compressionLevel: level, protectedTerms: terms.split('\n').map(term => term.trim()).filter(Boolean) }) as Job;
      setJob(next); setManualText(null); setAttempts(count => count + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Demande impossible.'); }
    finally { setBusy(false); }
  }
  async function accept() {
    setBusy(true); setError('');
    try { await request('', 'PUT', editorialSelectionRequest(job, { dirty, currentVersion: sourceVersion, manualText, elementId, sourceText })); await onAccepted(); setOpened(false); setJob(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Acceptation impossible.'); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (job && ['QUEUED', 'PROCESSING', 'PROPOSED'].includes(job.status)) await request('/ai-jobs/' + job.id, 'DELETE').catch(() => undefined);
    setOpened(false); setJob(null);
  }
  return <section className="design-status">
    <p>Votre texte est trop long pour cette composition. L’original est conservé.</p>
    <button type="button" disabled={dirty} onClick={() => { setManualText(null); setOpened(true); }}>Raccourcir avec InvitaFlow</button>{' '}
    <button type="button" disabled={dirty} onClick={() => { setManualText(sourceText); setOpened(true); }}>Modifier moi-même</button>{' '}
    <button type="button" onClick={onTemplate}>Changer de disposition / template</button>
    <p>Pour modifier vous-même le texte source, utilisez les informations de l’événement. Enregistrez le design avant de demander une proposition.</p>
    {opened && <dialog ref={dialogRef} aria-labelledby="editorial-title" aria-modal="true" className="template-preview-dialog editorial-assist-dialog" onCancel={event => { event.preventDefault(); if (!busy) void cancel(); }}><div className="template-preview-card">
      <button type="button" className="template-preview-close" aria-label="Annuler l’assistance" disabled={busy} onClick={() => void cancel()}>×</button>
      <h2 id="editorial-title">Raccourcir votre texte</h2>
      <label>Langue<select value={language} onChange={event => setLanguage(event.target.value)}><option value="fr">Français</option><option value="en">English</option><option value="ln">Lingala — nécessite un provider compatible</option></select></label>
      <label>Ton<select value={tone} onChange={event => setTone(event.target.value)}>{['preserve', 'romantic', 'religious', 'traditional', 'formal', 'warm', 'elegant', 'institutional', 'friendly'].map(value => <option key={value} value={value}>{({ preserve: 'Conserver le ton original', romantic: 'Romantique', religious: 'Religieux', traditional: 'Traditionnel', formal: 'Formel', warm: 'Chaleureux', elegant: 'Élégant', institutional: 'Institutionnel', friendly: 'Convivial' } as Record<string, string>)[value]}</option>)}</select></label>
      <label>Réduction<select value={level} onChange={event => setLevel(event.target.value)}><option value="LIGHT">Légère (10–20 %)</option><option value="BALANCED">Équilibrée (25–40 %)</option><option value="CONCISE">Forte, adaptée à la zone</option></select></label>
      <label>Fragments à préserver — un par ligne<textarea value={terms} onChange={event => setTerms(event.target.value)} maxLength={10000} /></label>
      <h3>Original</h3><p className="editorial-copy" style={{ whiteSpace: 'pre-wrap' }}>{job?.editorial?.sourceText ?? sourceText}</p>
      {manualText !== null && <label>Version à enregistrer<textarea value={manualText} onChange={event => setManualText(event.target.value)} maxLength={12000} /></label>}
      <h3>Proposition IA</h3>{job?.editorial ? <><p className="editorial-copy" style={{ whiteSpace: 'pre-wrap' }}>{job.editorial.proposedText}</p>{!job.editorial.fits && <p>Cette proposition dépasse encore. Choisissez une réduction plus forte ou une autre composition.</p>}</> : <p>{job ? job.status : 'Aucune proposition demandée.'}</p>}
      {job?.errorCode && <p role="alert">{job.errorCode} — l’original reste intact.</p>}
      {stale && <p role="alert">Proposition obsolète : enregistrez vos modifications et demandez une nouvelle proposition.</p>}
      {error && <><p role="alert">{error}</p>{job && ['QUEUED', 'PROCESSING'].includes(job.status) && <button type="button" onClick={() => { setError(''); setJob({ ...job }); }}>Réessayer le suivi</button>}</>}
      <button type="button" onClick={() => void generate()} disabled={busy || stale || attempts >= 3 || (!!job && ['QUEUED', 'PROCESSING'].includes(job.status))}>{job ? 'Générer une autre proposition' : 'Proposer une version courte'}</button>{' '}
      <button type="button" onClick={() => void accept()} disabled={busy || !canApplyEditorial(job, { dirty, currentVersion: sourceVersion, manualText })}>Utiliser cette version</button>{' '}
      <button type="button" disabled={busy} onClick={() => setManualText(job?.editorial?.proposedText ?? sourceText)}>Modifier manuellement</button>{' '}
      <button type="button" disabled={busy} onClick={() => void cancel()}>Annuler — garder l’original</button>
    </div></dialog>}
  </section>;
}
