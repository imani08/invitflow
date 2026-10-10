'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { loadPrivateMediaPreview } from '@/lib/private-media-preview.mjs';
import { PROFESSIONAL_RECIPES, renderResolvedLayoutSvg, resolveDesignLayout, type DesignDocument } from '@invitaflow/design-document';

type ComposerEvent = { id: string; name: string; eventType?: string; startAt?: string | null; venue?: string | null; coupleNames?: string | null; invitationText?: string | null; ceremonies?: { name: string; date?: string | null; time?: string | null; venue?: string | null; address?: string | null; reference?: string | null; dressCode?: string | null }[] };
type Proposal = { document: DesignDocument; recipeId: string; reason: string; fingerprint: string; score: Record<string, number> };
type PrivatePhoto = { id: string; width: number; height: number; purpose: string; status: string };
function errorMessage(reason: unknown, fallback: string) {
  if (reason instanceof Error && reason.message) return reason.message;
  if (reason && typeof reason === 'object' && 'message' in reason) {
    const message = reason.message;
    if (typeof message === 'string' && message) return message;
    if (Array.isArray(message)) return message.filter((part): part is string => typeof part === 'string').join(' ') || fallback;
  }
  return fallback;
}
const styleOptions: readonly [string, string][] = [['botanical', 'Botanique'], ['classic', 'Classique'], ['luxury', 'Luxueux'], ['editorial', 'Éditorial'], ['modern', 'Moderne'], ['african-contemporary', 'Africain contemporain'], ['minimal', 'Minimaliste']];
const moodOptions: readonly [string, string][] = [['romantic', 'Romantique'], ['formal', 'Formel'], ['religious', 'Religieux'], ['warm', 'Chaleureux'], ['minimal', 'Sobre']];
const colorOptions: readonly [string, string][] = [['gold', 'Or'], ['ivory', 'Ivoire'], ['green', 'Vert'], ['dark', 'Sombre']];

export default function AIComposer({ event, busy, onChoose }: { event: ComposerEvent; busy: boolean; onChoose: (proposal: Proposal) => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [photoInventory, setPhotoInventory] = useState<PrivatePhoto[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [photoLoading, setPhotoLoading] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const photoInput = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState('');
  const [mood, setMood] = useState('');
  const [colors, setColors] = useState<string[]>([]);
  const [media, setMedia] = useState<'ANY' | 'WITH_PHOTO' | 'WITHOUT_PHOTO'>('ANY');
  const [count, setCount] = useState('4');
  const [description, setDescription] = useState('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [assets, setAssets] = useState<Record<string, string>>({});
  const requestController = useRef<AbortController | null>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const ids = useMemo(() => [...new Set(proposals.flatMap(item => (Array.isArray(item.document['elements']) ? item.document['elements'] : []).filter((layer: Record<string, unknown>) => layer['type'] === 'IMAGE' && typeof layer['assetId'] === 'string').map((layer: Record<string, unknown>) => layer['assetId'] as string)))], [proposals]);
  const ceremonies = Array.isArray(event.ceremonies) ? event.ceremonies : [];
  const eventType = event.eventType === 'OTHER' ? 'CUSTOM' : event.eventType;
  const recipeTypes = useMemo(() => [...new Set(PROFESSIONAL_RECIPES.flatMap(recipe => recipe.supportedEventTypes))], []);
  const supportedEvent = !!eventType && recipeTypes.includes(eventType);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const items: PrivatePhoto[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 20; page++) {
        const query = new URLSearchParams({ limit: '100' });
        if (cursor) query.set('cursor', cursor);
        const response = await fetch(`/api/assets?${query}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Inventaire indisponible');
        const payload = await response.json() as { items?: PrivatePhoto[]; nextCursor?: string | null };
        items.push(...(payload.items ?? []));
        if (!payload.nextCursor) break;
        cursor = payload.nextCursor;
      }
      if (!controller.signal.aborted) setPhotoInventory(items.filter(photo => photo.purpose === 'PHOTO' && photo.status === 'READY' && photo.width > 0 && photo.height > 0));
    })().catch(() => { if (!controller.signal.aborted) setPhotoInventory([]); }).finally(() => { if (!controller.signal.aborted) setPhotoLoading(false); });
    return () => { controller.abort(); requestController.current?.abort(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    if (!ids.length) { setAssets({}); return; }
    void Promise.all(ids.map(async id => {
      try {
        const url = await loadPrivateMediaPreview(id);
        if (cancelled) { URL.revokeObjectURL(url); return [id, ''] as const; }
        urls.push(url);
        return [id, url] as const;
      } catch { return [id, ''] as const; }
    })).then(items => { if (!cancelled) setAssets(Object.fromEntries(items)); });
    return () => { cancelled = true; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [ids]);

  async function generate() {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setRequesting(true); setError('');
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(event.id)}/designs/composer/proposals`, {
        method: 'POST', cache: 'no-store', signal: controller.signal, headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seed: crypto.randomUUID(), preferences: { style, mood, colors, media, description, count: Number(count), photoIds: media === 'WITHOUT_PHOTO' ? [] : selectedPhotoIds.length ? selectedPhotoIds : undefined }, previouslyShown: seen.slice(-200) }),
      });
      const payload = await response.json().catch(() => ({})) as { items?: Proposal[]; message?: string | string[]; error?: string };
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(' ') : payload.message ?? (response.status === 404 ? 'Le Composer n’est pas disponible sur le Gateway actuellement. Recréez le service Gateway puis réessayez.' : 'Le Composer ne peut pas proposer de compositions maintenant.'));
      if (!Array.isArray(payload.items) || payload.items.length === 0) { setProposals([]); setError('Nous n’avons pas encore trouvé de composition adaptée à ces critères. Essayez sans certaines préférences ou laissez InvitaFlow choisir les photos.'); return; }
      setProposals(payload.items); setSeen(current => [...current, ...payload.items!.map(item => item.fingerprint)]);
    } catch (reason) { if (!controller.signal.aborted) setError(errorMessage(reason, 'Propositions indisponibles.')); }
    finally { if (requestController.current === controller) { requestController.current = null; setRequesting(false); } }
  }

  function layoutFor(proposal: Proposal) {
    return resolveDesignLayout(proposal.document, {
      guest: { name: '' }, table: { name: '' },
      event: { title: event.name, coupleNames: event.coupleNames ?? '', invitationText: event.invitationText ?? '', date: event.startAt ?? '', venue: event.venue ?? '' },
      ceremonies: ceremonies.map(ceremony => ({ name: ceremony.name, date: ceremony.date ?? '', time: ceremony.time ?? '', venue: ceremony.venue ?? '', address: ceremony.address ?? '', reference: ceremony.reference ?? '', dressCode: ceremony.dressCode ?? '' })),
      qr: { available: false },
    }, undefined, assets, { mode: 'web' });
  }

  function toggle(value: string, current: string[], update: (value: string[]) => void) {
    update(current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  }

  const currentPreview = preview === null ? null : proposals[preview] ?? null;
  useEffect(() => {
    if (!currentPreview || !previewDialog.current) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = previewDialog.current;
    const closeButton = dialog.querySelector<HTMLButtonElement>('.template-preview-close');
    closeButton?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPreview(null); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')];
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); previouslyFocused?.focus(); };
  }, [currentPreview]);
  const steps = ['Votre événement', 'Vos photos', 'Votre style', 'Propositions'];
  function togglePhoto(id: string) { setSelectedPhotoIds(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 20 ? [...current, id] : current); }
  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) { setPhotoError('Choisissez une photo JPG, PNG ou WebP de 5 Mio maximum.'); return; }
    setPhotoUploading(true);
    try {
      const createdResponse = await fetch('/api/assets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size, purpose: 'PHOTO' }), cache: 'no-store' });
      const created = await createdResponse.json() as { id?: string; message?: string };
      if (!createdResponse.ok || typeof created.id !== 'string') throw new Error(created.message ?? 'Impossible de préparer l’import de la photo.');
      const uploadResponse = await fetch(`/api/assets/${encodeURIComponent(created.id)}/upload-url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' });
      const uploadPayload = await uploadResponse.json() as { upload?: { url?: string; method?: string; fields?: Record<string, string> }; message?: string };
      if (!uploadResponse.ok || typeof uploadPayload.upload?.url !== 'string' || uploadPayload.upload.method !== 'POST' || !uploadPayload.upload.fields) throw new Error(uploadPayload.message ?? 'Impossible de téléverser cette photo.');
      const form = new FormData();
      for (const [key, value] of Object.entries(uploadPayload.upload.fields)) form.append(key, value);
      form.append('file', file, file.name);
      const uploaded = await fetch(uploadPayload.upload.url, { method: 'POST', body: form });
      if (!uploaded.ok) throw new Error('Le stockage a refusé la photo. Réessayez.');
      const completeResponse = await fetch(`/api/assets/${encodeURIComponent(created.id)}/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', cache: 'no-store' });
      const asset = await completeResponse.json() as PrivatePhoto & { message?: string };
      if (!completeResponse.ok || asset.status !== 'READY' || !Number.isInteger(asset.width) || !Number.isInteger(asset.height)) throw new Error(asset.message ?? 'La photo n’a pas passé la validation Media.');
      setPhotoInventory(current => [...current, asset]);
      setSelectedPhotoIds(current => current.length < 20 ? [...current, asset.id] : current);
      setMedia('WITH_PHOTO');
    } catch (cause) { setPhotoError(cause instanceof Error ? cause.message : 'L’import de la photo a échoué.'); }
    finally { setPhotoUploading(false); if (photoInput.current) photoInput.current.value = ''; }
  }
  return <section className="ai-composer" aria-labelledby="ai-composer-title">
    <div className="ai-composer-heading"><span className="design-kicker">COMPOSITION GUIDÉE · SANS IMAGE GÉNÉRÉE</span><h2 id="ai-composer-title">Créer avec InvitaFlow AI</h2><p>Nous préparons des propositions à partir des informations de votre événement.</p></div>
    <nav className="journey-steps" aria-label="Étapes de création">{steps.map((label, index) => <button type="button" key={label} aria-current={step === index ? 'step' : undefined} onClick={() => { if (index < step) setStep(index); else if (index === step + 1 && (index !== 3 || supportedEvent)) setStep(index); }}>{index + 1}. {label}</button>)}</nav>
    {step === 0 && <div className="journey-event-summary"><h3>{event.name}</h3><p>{eventType ? `Type : ${eventType}` : 'Type d’événement non renseigné'} · {ceremonies.length ? `${ceremonies.length} cérémonie(s)` : 'Aucune cérémonie renseignée'}</p><p>Vous pouvez compléter ou modifier ces informations depuis l’événement.</p><Link href={`/events?event=${encodeURIComponent(event.id)}#ceremony-${encodeURIComponent(event.id)}`}>Modifier les informations de l’événement</Link><button type="button" className="ai-request-action" onClick={() => setStep(1)}>Continuer</button></div>}
    {step === 1 && <div className="journey-photo-step"><h3>Souhaitez-vous utiliser des photos ?</h3><p>Une photo n’est jamais obligatoire pour obtenir une proposition soignée.</p><div className="ai-composer-chips" role="group" aria-label="Utilisation des photos">{([['ANY', 'Laisser InvitaFlow décider'], ['WITH_PHOTO', 'Avec mes photos'], ['WITHOUT_PHOTO', 'Sans photo']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={media === value} onClick={() => setMedia(value)}>{label}</button>)}</div>{media !== 'WITHOUT_PHOTO' && <><div className="journey-photo-grid" aria-busy={photoLoading}>{photoLoading ? <p role="status">Chargement des photos privées…</p> : photoInventory.length ? photoInventory.map(photo => <PhotoChoice key={photo.id} photo={photo} selected={selectedPhotoIds.includes(photo.id)} onToggle={() => togglePhoto(photo.id)} />) : <p>Aucune photo disponible. Vous pouvez continuer sans photo ou laisser InvitaFlow décider.</p>}</div><button type="button" className="journey-photo-upload" disabled={photoUploading || selectedPhotoIds.length >= 20} onClick={() => photoInput.current?.click()}>{photoUploading ? 'Import et validation en cours…' : 'Ajouter une photo'}</button><input ref={photoInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void uploadPhoto(event.target.files?.[0])} />{photoError && <p role="alert" className="ai-composer-error">{photoError}</p>}{photoInventory.length > 0 && <p>{selectedPhotoIds.length ? `${selectedPhotoIds.length} photo(s) choisie(s)` : 'Aucune sélection : InvitaFlow utilisera les photos adaptées.'}</p>}</>}<button type="button" className="ai-request-action" onClick={() => setStep(2)}>Continuer</button></div>}
    {step === 2 && <div className="ai-composer-preferences">
      <label>Style<select value={style} onChange={eventChange => setStyle(eventChange.target.value)}><option value="">Choisir un style</option>{styleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Ambiance<select value={mood} onChange={eventChange => setMood(eventChange.target.value)}><option value="">Choisir une ambiance</option>{moodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Nombre<select value={count} onChange={eventChange => setCount(eventChange.target.value)}>{[3, 4, 5, 6].map(value => <option key={value} value={value}>{value} propositions</option>)}</select></label>
      <fieldset><legend>Couleurs souhaitées</legend><div className="ai-composer-chips">{colorOptions.map(([value, label]) => <label key={value}><input type="checkbox" checked={colors.includes(value)} onChange={() => toggle(value, colors, setColors)} />{label}</label>)}</div></fieldset>
      <label className="ai-composer-description">Ambiance en quelques mots<textarea value={description} onChange={eventChange => setDescription(eventChange.target.value)} maxLength={240} placeholder="Ex. sobre et chrétien, sans photo, avec de l’or" /></label>
      <div className="journey-style-refinements" aria-label="Affiner le style">{[['modern', 'Plus moderne'], ['classic', 'Plus classique'], ['minimal', 'Plus minimaliste'], ['botanical', 'Plus floral'], ['luxury', 'Plus luxueux'], ['african-contemporary', 'Plus africain contemporain']].map(([value, label]) => <button type="button" key={value ?? label} aria-pressed={style === value} onClick={() => setStyle(value ?? '')}>{label ?? value}</button>)}</div>
      <div className="journey-step-actions"><button type="button" onClick={() => setStep(1)}>Retour aux photos</button><button type="button" className="ai-request-action" disabled={requesting || busy || !supportedEvent} onClick={() => { setStep(3); if (!proposals.length) void generate(); }}>{requesting ? 'InvitaFlow prépare vos propositions…' : 'Préparer les propositions'}</button></div>
    </div>}
    {step === 3 && <><div className="journey-step-actions"><button type="button" onClick={() => setStep(2)}>Modifier mes préférences</button><button type="button" className="ai-request-action" disabled={requesting || busy} onClick={() => void generate()}>{requesting ? 'InvitaFlow prépare vos propositions…' : proposals.length ? 'Voir d’autres propositions' : 'Réessayer'}</button></div>{!supportedEvent && <p role="status">Ce type d’événement n’est pas encore pris en charge par le catalogue de compositions.</p>}</>}
    {error && <p className="ai-composer-error" role="alert">{error}</p>}
    {proposals.length > 0 && <div className="ai-composer-list" aria-label="Propositions de composition">{proposals.map((proposal, index) => {
      const layout = layoutFor(proposal);
      const composer = proposal.document['metadata']['composer'] as Record<string, unknown>;
      const name = String(proposal.document['metadata']['name'] ?? proposal.recipeId);
      return <article className="ai-composer-card" key={proposal.fingerprint}>
        <div className="ai-composer-preview" role="img" aria-label={`Aperçu ${index + 1} : ${name}`}><svg viewBox={`0 0 ${proposal.document['canvas'].width} ${proposal.document['canvas'].height}`} dangerouslySetInnerHTML={{ __html: renderResolvedLayoutSvg(layout, { assets, fragment: true }) }} /></div>
        <div className="ai-composer-card-copy"><span className="design-kicker">PROPOSITION {index + 1} · {String(composer['mediaStrategy']).replaceAll('_', ' ')}</span><h3>{name}</h3><p>{proposal.reason}</p><div className="ai-composer-card-actions"><button type="button" onClick={() => setPreview(index)}>Voir</button><button type="button" disabled={busy} onClick={() => void onChoose(proposal)}>Choisir cette proposition</button></div></div>
      </article>;
    })}</div>}
    {currentPreview && <dialog ref={previewDialog} open className="template-preview-dialog ai-composer-dialog" aria-modal="true" aria-labelledby="ai-composer-preview-title" onCancel={() => setPreview(null)}><div className="template-preview-card"><button type="button" className="template-preview-close" onClick={() => setPreview(null)} aria-label="Fermer l’aperçu">×</button><span className="design-kicker">APERÇU RÉEL · {currentPreview.recipeId}</span><div className="ai-composer-large-preview"><svg viewBox={`0 0 ${currentPreview.document['canvas'].width} ${currentPreview.document['canvas'].height}`} dangerouslySetInnerHTML={{ __html: renderResolvedLayoutSvg(layoutFor(currentPreview), { assets, fragment: true }) }} /></div><h2 id="ai-composer-preview-title">{String(currentPreview.document['metadata']['name'] ?? currentPreview.recipeId)}</h2><p>{currentPreview.reason}</p><button type="button" className="template-choose" disabled={busy} onClick={() => void onChoose(currentPreview)}>Choisir cette proposition</button></div></dialog>}
  </section>;
}

function PhotoChoice({ photo, selected, onToggle }: { photo: PrivatePhoto; selected: boolean; onToggle: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let cancelled = false; let objectUrl = ''; void loadPrivateMediaPreview(photo.id).then(value => { objectUrl = value; if (cancelled) URL.revokeObjectURL(value); else setUrl(value); }).catch(() => undefined); return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [photo.id]);
  const orientation = photo.width === photo.height ? 'Carrée' : photo.width > photo.height ? 'Paysage' : 'Portrait';
  return <label className="journey-photo-choice"><input type="checkbox" checked={selected} onChange={onToggle} /><span>{url ? <Image src={url} alt="" width={photo.width} height={photo.height} unoptimized loading="lazy" /> : <span className="journey-photo-placeholder" aria-hidden="true">Photo privée</span>}<small>{orientation} · {photo.width} × {photo.height}</small></span></label>;
}
