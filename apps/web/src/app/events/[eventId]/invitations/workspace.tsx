'use client';
import { useJourneyDraft } from '@/components/journey-drafts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmationState, generationMessage, singlePdfItem } from '@/lib/invitation-confirmation.mjs';
import { formatDateTime } from '@/lib/date-format.mjs';
import InvitationDocumentPreview from '@/components/invitation-document-preview';



type Design = { id: string; name: string; version: number; document?: { elements?: { id: string; type: string; text?: string; color?: string; fontSize?: number; align?: string; x?: number; y?: number }[]; canvas?: { width: number; height: number }; theme?: { tokens?: { background?: string; primary?: string; font?: string } } } };
type Guest = { id: string; fullName: string; email?: string | null };
type Batch = { settledAt?: string | null; settlementCredits?: number | null; id: string; status: string; totalItems: number; completedItems: number; failedItems: number; zipExpiresAt?: string | null; zipDeletedAt?: string | null; zipSizeBytes?: string | number | null; items?: { id: string; guestId: string; status: string; objectKey: string | null; errorCode?: string | null }[]; createdAt: string };
type Quote = { invitationCount: number; creditsRequired: number; availableCredits: number; walletAvailableCredits: number; agencyAvailableCredits: number; missingCredits: number; guestIds: string[]; designVersion: number };
type EmissionIntent = { signature: string; key: string; payload: { designId: string; expectedDesignVersion: number; guestIds: string[] } };
type WalletBalance = { availableCredits: number; reservedCredits: number; currency: 'CREDITS' };
async function api<T>(eventId: string, path: string, method = 'GET', data?: unknown, key?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/${path}`, { method, signal: signal ?? null, headers: { ...(data !== undefined ? { 'content-type': 'application/json' } : {}), ...(key ? { 'idempotency-key': key } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}), cache: 'no-store' });
  const value = await response.json().catch(() => ({})); if (!response.ok) throw new Error(value?.message ?? 'La demande a échoué.'); return value as T;
}
function formatFileSize(value: Batch['zipSizeBytes']) {
  const bytes = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To']; let size = bytes / 1024; let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit += 1; }
  return `${size.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${units[unit]}`;
}
export function InvitationsWorkspace({ eventId, eventName }: { eventId: string; eventName: string }) {
  const [designs, setDesigns] = useState<Design[]>([]); const [previewDesign, setPreviewDesign] = useState<Design | null>(null); const [guests, setGuests] = useState<Guest[]>([]); const [guestTotal, setGuestTotal] = useState(0); const [guestSearch, setGuestSearch] = useState(''); const [selectedGuests, setSelectedGuests] = useState<string[]>([]); const [allGuestsSelected, setAllGuestsSelected] = useState(true); const [designId, setDesignId] = useState(''); const [batches, setBatches] = useState<Batch[]>([]); const [batchDetails, setBatchDetails] = useState<Record<string, Batch>>({}); const [wallet, setWallet] = useState<WalletBalance | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [batchRefreshError, setBatchRefreshError] = useState('');
  const [batchRefreshRevision, setBatchRefreshRevision] = useState(0);
  const submitting = useRef(false);
  const retryRequest = useRef<EmissionIntent | null>(null);
  const [emissionIntent, setEmissionIntent] = useState<EmissionIntent | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null), [quoteError, setQuoteError] = useState(''), [quoteRevision, setQuoteRevision] = useState(0);
  const [selection, setSelection] = useState<{ designId: string; version: number } | null>(null);
  const [downloadRequested, setDownloadRequested] = useState(false);
  const draftValue = { designId, selectedGuests, allGuestsSelected, emissionIntent };
  const draft = useJourneyDraft('invitation-selection', draftValue, saved => {
    if (typeof saved.designId === 'string' && designs.some(design => design.id === saved.designId)) setDesignId(saved.designId);
    setSelectedGuests(Array.isArray(saved.selectedGuests) ? saved.selectedGuests.filter(id => guests.some(guest => guest.id === id)) : []);
    setAllGuestsSelected(saved.allGuestsSelected === true);
    setEmissionIntent(saved.emissionIntent ?? null); retryRequest.current = saved.emissionIntent ?? null;
  }, !loading);
  async function downloadSinglePdf(batchId: string) {
    try {
      const detail = await api<Batch>(eventId, `invitations/batches/${encodeURIComponent(batchId)}`);
      setBatchDetails(current => ({ ...current, [batchId]: detail }));
      const item = singlePdfItem(detail);
      if (!item) throw new Error('Le fichier doit être disponible et son financement confirmé.');
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/invitations/batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(item.id)}/download`, { cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/pdf')) throw new Error('Le PDF ne peut pas être téléchargé. Réessayez.');
      const url=URL.createObjectURL(await response.blob()), link=document.createElement('a');
      link.href=url;link.download='invitation.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch(error) { setMessage(error instanceof Error ? error.message : 'Téléchargement impossible.'); }
  }
  const load = useCallback(async () => {
    try {
      setLoading(true); setMessage('');
      const [designResult, batchResult, walletResult] = await Promise.all([api<{ items: Design[]; selection?: { designId: string; version: number } | null }>(eventId, 'designs'), api<Batch[]>(eventId, 'invitations/batches'), fetch('/api/wallet/me', { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error('Solde de crédits indisponible.'); return response.json() as Promise<WalletBalance>; }).catch(() => null)]);
      if (!Array.isArray(designResult.items) || !Array.isArray(batchResult)) throw new Error('Réponse des invitations incomplète. Réessayez le chargement.');
      setSelection(designResult.selection ?? null); setDesigns(designResult.items); setBatches(batchResult);
      setWallet(walletResult && walletResult.currency === 'CREDITS' && Number.isSafeInteger(walletResult.availableCredits) ? walletResult : null);
      const selectedDesignId = designResult.items?.find(item => item.id === designResult.selection?.designId)?.id ?? designResult.items?.[0]?.id ?? ''; setDesignId(selectedDesignId);
      const found: Guest[] = []; let cursor = ''; let total = 0;
      do { const page = await api<{ items: Guest[]; total: number; nextCursor: string | null }>(eventId, `guests?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`); if (!Array.isArray(page.items)) throw new Error('La liste des invités est incomplète.'); found.push(...page.items); total = Number.isSafeInteger(page.total) ? page.total : found.length; cursor = page.nextCursor ?? ''; if (found.length >= 5000) break; } while (cursor);
      setGuests(found); setGuestTotal(total);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Impossible de charger les données.'); } finally { setLoading(false); }
  }, [eventId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { let active = true; setPreviewDesign(null); if (designId) void api<Design>(eventId, `designs/${encodeURIComponent(designId)}`).then(design => { if (active) setPreviewDesign(design); }).catch(error => { if (active) setMessage(error.message); }); return () => { active = false; }; }, [eventId, designId]);
  useEffect(() => {
    let active = true, failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const items = await api<Batch[]>(eventId, 'invitations/batches', 'GET', undefined, undefined, controller.signal);
        if (!Array.isArray(items)) throw new Error('Réponse des invitations incomplète.');
        if (!active) return;
        setBatches(items); setBatchRefreshError(''); failures = 0;
      } catch {
        if (!active) return;
        failures += 1;
        setBatchRefreshError('Actualisation impossible. Le dernier état reçu est conservé. Nouvelle tentative automatique dans quelques instants.');
      }
      if (active) timer = setTimeout(() => void poll(), failures ? Math.min(60000, 5000 * 2 ** Math.min(failures, 4)) : 5000);
    };
    timer = setTimeout(() => void poll(), batchRefreshRevision ? 0 : 5000);
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, [eventId, batchRefreshRevision]);
  const previewGuest = guests.find(guest => guest.id === selectedGuests[0]) ?? guests[0];
  const requestedCount = allGuestsSelected ? guestTotal : selectedGuests.length;
  const reviewSignature = JSON.stringify({ designId, version: previewDesign?.version, guests: allGuestsSelected ? 'ALL' : [...selectedGuests].sort() });
  useEffect(() => {
    setQuote(null); setQuoteError('');
    if (!designId || !previewDesign || previewDesign.id !== designId || requestedCount < 1 || loading) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const payload = emissionIntent?.signature === reviewSignature ? emissionIntent.payload : { designId, expectedDesignVersion: previewDesign.version, ...(!allGuestsSelected ? { guestIds: selectedGuests } : {}) };
      void fetch('/api/events/' + eventId + '/invitations/quote', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store', signal: controller.signal }).then(async response => {
        const value = await response.json();
        if (!response.ok || !Number.isSafeInteger(value.creditsRequired) || !Number.isSafeInteger(value.availableCredits) || !Number.isSafeInteger(value.missingCredits) || !Array.isArray(value.guestIds)) throw new Error(typeof value.message === 'string' ? value.message : 'Devis de crédits indisponible.');
        if (!controller.signal.aborted) setQuote(value);
      }).catch(error => { if (!controller.signal.aborted) setQuoteError(error instanceof Error ? error.message : 'Devis indisponible.'); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [designId, previewDesign, requestedCount, loading, eventId, reviewSignature, allGuestsSelected, selectedGuests, emissionIntent, quoteRevision]);
  const createBatch = async () => {
    const replay = retryRequest.current?.signature === reviewSignature;
    if (!quote || (!replay && quote.missingCredits > 0) || !designId || !previewDesign || submitting.current) return;
    if (!replay && !window.confirm('Émission finale : ' + quote.invitationCount + ' invitation(s), ' + quote.creditsRequired + ' crédit(s) nécessaires. Disponibles : ' + quote.availableCredits + '. Chaque nouvelle émission volontaire coûte 1 crédit par invité. Une répétition technique conserve la même émission. Confirmer ?')) return;
    submitting.current = true; setBusy(true); setMessage('');
    try {
      const intent = retryRequest.current?.signature === reviewSignature ? retryRequest.current : { signature: reviewSignature, key: crypto.randomUUID(), payload: { designId, expectedDesignVersion: quote.designVersion, guestIds: quote.guestIds } };
      retryRequest.current = intent; setEmissionIntent(intent);
      // Persist the intent BEFORE submitting: refresh/network retry reuses this key
      // and this exact authorized selection, never an accidental new emission.
      await draft.save({ ...draftValue, emissionIntent: intent });
      const batch = await api<Batch>(eventId, 'invitations/batches', 'POST', intent.payload, intent.key);
      setBatches(items => [batch, ...items.filter(item => item.id !== batch.id)]);
      setMessage(generationMessage(batch));
      window.dispatchEvent(new Event('invitaflow:wallet-updated'));
      setQuoteRevision(value => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Le lot n’a pas pu être créé.'); }
    finally { submitting.current = false; setBusy(false); }
  };
  async function buyMissing() {
    try {
      await draft.save(draftValue);
      const response = await fetch('/api/journey-wallet', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: location.pathname + location.search + location.hash, missing: quote?.missingCredits }), cache: 'no-store' });
      const value = await response.json();
      if (!response.ok || typeof value.href !== 'string' || !value.href.startsWith('/account/wallet?')) throw new Error('Le retour vers cet événement ne peut pas être préparé.');
      location.assign(value.href);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Le brouillon ne peut pas être enregistré.'); }
  }
  const toggleGuest = (id: string) => {
    if (allGuestsSelected) { setAllGuestsSelected(false); setSelectedGuests(guests.filter(guest => guest.id !== id).map(guest => guest.id)); return; }
    setSelectedGuests(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };
  const selectAllGuests = () => { setAllGuestsSelected(true); setSelectedGuests([]); };
  const statusLabel: Record<string, string> = { RESERVING: 'Réservation des crédits', QUEUED: 'En attente', GENERATING: 'Préparation en cours', COMPLETED: 'Terminé', FINALIZING: 'Confirmation financière', PARTIAL: 'Succès partiel', FAILED: 'Échec', CANCELLED: 'Annulé' };
  return <section className="invitation-workspace">
    {loading ? <section className="invitation-panel" aria-live="polite">Chargement des designs, invités et lots…</section> : <><div className="invitation-panel" id="invitation-generation"><div className="invitation-panel-title"><div><span className="eyebrow">GÉNÉRATION FINALE</span><h2>Préparer vos invitations</h2></div><a href={`/events/${eventId}/designs`}>Gérer les designs ↗</a></div>
      {designs.length ? selection?.designId === designId ? <div className="invitation-select"><strong>Design choisi</strong><span>{designs.find(design => design.id === designId)?.name ?? 'Votre design'} · version {previewDesign?.version ?? selection.version}</span><a href={`/events/${eventId}/designs`}>Modifier le design</a></div> : <label className="invitation-select">Design<select value={designId} onChange={e => setDesignId(e.target.value)}>{designs.map(d => <option value={d.id} key={d.id}>{d.name} · version {d.version}</option>)}</select></label> : <p className="invitation-empty">Créez d’abord un design pour préparer vos invitations.</p>}
      {previewDesign?.document && <InvitationDocumentPreview eventId={eventId} guestId={previewGuest?.id} document={previewDesign.document} />}
      {selection?.designId === designId && previewDesign && selection.version !== previewDesign.version && <p role="alert">Le design a changé depuis votre sélection. Relisez l’aperçu de la version {previewDesign.version} avant de générer.</p>}
      <div className="invitation-summary"><p><a href={`/events?event=${encodeURIComponent(eventId)}#ceremony-${encodeURIComponent(eventId)}`}>Modifier le programme</a> · <a href={`/events/${encodeURIComponent(eventId)}/guests`}>Modifier les invités</a> · <a href={`/events/${encodeURIComponent(eventId)}/seating`}>Modifier les tables (facultatif)</a></p><p><strong>{eventName}</strong> · {previewDesign?.name ?? 'Choisissez un design'}</p><p>{quote ? 'Vous souhaitez générer ' + quote.invitationCount + ' invitations. Vous disposez de ' + quote.availableCredits + ' crédits. Crédits nécessaires : ' + quote.creditsRequired + '.' : quoteError || 'Vérification du coût par le serveur…'}</p>{quote && quote.missingCredits > 0 && <p role="alert">Il vous manque {quote.missingCredits} crédits. <button onClick={() => void buyMissing()}>Acheter des crédits</button> <a href="#invitation-guests">Modifier ma sélection d’invités</a></p>}{quoteError && <button onClick={() => setQuoteRevision(value => value + 1)}>Réessayer le devis</button>}<p>{wallet ? `${wallet.availableCredits} crédit(s) disponibles dans le wallet · ${wallet.reservedCredits} réservé(s)` : 'Solde wallet non disponible'}</p><small>La preview est gratuite. Le quota d’agence éventuel est vérifié par le service; seul le rendu final peut réserver des crédits. Le décompte final suit les PDF générés.</small></div>
      <div className="invitation-guest-head" id="invitation-guests"><div><h3>Invités concernés</h3><p>{allGuestsSelected ? `${guests.length.toLocaleString('fr-FR')} affiché(s) · les ${guestTotal.toLocaleString('fr-FR')} invités de l’événement seront inclus` : `${selectedGuests.length.toLocaleString('fr-FR')} sélectionné(s)`}</p></div><button className="invitation-link-button" onClick={allGuestsSelected ? () => { setAllGuestsSelected(false); setSelectedGuests([]); } : selectAllGuests}>{allGuestsSelected ? 'Choisir des invités' : 'Inclure tous les invités'}</button></div>
      <label className="invitation-search">Rechercher un invité<input type="search" value={guestSearch} onChange={event => setGuestSearch(event.target.value)} placeholder="Nom ou e-mail" /></label>
      <div className="invitation-guest-list">{guests.filter(guest => `${guest.fullName} ${guest.email ?? ''}`.toLocaleLowerCase().includes(guestSearch.trim().toLocaleLowerCase())).map(guest => <label key={guest.id}><input type="checkbox" checked={allGuestsSelected || selectedGuests.includes(guest.id)} onChange={() => toggleGuest(guest.id)} /><span>{guest.fullName}</span><small>{guest.email}</small></label>)}{guests.length > 0 && !guests.some(guest => `${guest.fullName} ${guest.email ?? ''}`.toLocaleLowerCase().includes(guestSearch.trim().toLocaleLowerCase())) && <p className="invitation-empty">Aucun invité ne correspond à cette recherche.</p>}</div>
      <p className="invitation-validation-note">{guestTotal > guests.length ? `La liste affiche les ${guests.length.toLocaleString('fr-FR')} premiers invités. Vous pouvez tous les inclure, ou sélectionner jusqu’à 5 000 invités dans la liste.` : 'La validation finale des invités et cérémonies est effectuée par le service Invitations au démarrage du lot. Les lignes en échec seront détaillées dans le statut réel.'}</p>
      <div className="invitation-actions"><span>{requestedCount.toLocaleString('fr-FR')} invitation(s) · {requestedCount.toLocaleString('fr-FR')} crédit(s) max.</span><button className="invitation-primary" disabled={busy || !draft.ready || !quote || (quote.missingCredits > 0 && emissionIntent?.signature !== reviewSignature) || !designId || !previewDesign || loading || requestedCount < 1 || (!allGuestsSelected && requestedCount > 5000)} onClick={() => void createBatch()}>{busy ? 'Préparation…' : emissionIntent?.signature === reviewSignature ? 'Retrouver / reprendre cette émission' : 'Générer mes invitations'}</button>{emissionIntent && <button disabled={busy} onClick={() => { if (window.confirm('Préparer une NOUVELLE émission payante ? Le coût sera confirmé avant génération.')) { retryRequest.current = null; setEmissionIntent(null); } }}>Préparer une nouvelle émission payante</button>}</div>
      {message && <p className="invitation-message" role="status">{message}</p>}
    </div>
    {downloadRequested && <section className="invitation-panel" role="status"><h2>Votre téléchargement a été demandé</h2><p>Le navigateur prend en charge l’enregistrement du ZIP. Les fichiers restent accessibles dans les lots ci-dessous.</p><a className="invitation-download" href={`/events/${encodeURIComponent(eventId)}/invitations/merci`}>Continuer → Merci</a> · <a href={`/events/${encodeURIComponent(eventId)}`}>Revenir à mon événement</a></section>}
    <div className="invitation-panel"><div className="invitation-panel-title"><div><span className="eyebrow">Préparation de vos invitations</span><h2>Générations récentes</h2></div><button className="invitation-link-button" onClick={() => setBatchRefreshRevision(value => value + 1)}>Actualiser</button></div>
      {batchRefreshError && <p className="invitation-message" role="status">{batchRefreshError}</p>}
      {batches.length ? <div className="invitation-batches">{batches.map(batch => { const detail = batchDetails[batch.id]; const active = ['QUEUED','GENERATING','RESERVING','FINALIZING'].includes(batch.status); const cancellable = ['QUEUED','GENERATING'].includes(batch.status); const expired = Boolean(batch.zipDeletedAt) || Boolean(batch.zipExpiresAt && Date.parse(batch.zipExpiresAt) <= Date.now()); const funded = !!batch.settledAt && ['COMPLETED', 'PARTIAL', 'CANCELLED'].includes(batch.status); const zipReady = confirmationState(batch) === 'ready' && batch.completedItems > 0; const percent = batch.totalItems ? Math.min(100, Math.round((batch.completedItems + batch.failedItems) / batch.totalItems * 100)) : 0; const zipSize = formatFileSize(batch.zipSizeBytes); return <article key={batch.id}><div><strong>{formatDateTime(batch.createdAt)}</strong><span className={`invitation-status ${batch.status.toLowerCase()}`} aria-label={`Statut: ${statusLabel[batch.status] ?? batch.status}`}>{statusLabel[batch.status] ?? batch.status}</span></div><p>{generationMessage(batch)}</p><p>{batch.completedItems}/{batch.totalItems} invitations traitées{batch.failedItems ? ` · ${batch.failedItems} en échec` : ''}</p>{active && <div className="invitation-progress" role="progressbar" aria-valuemin={0} aria-valuemax={batch.totalItems} aria-valuenow={Math.min(batch.totalItems, batch.completedItems + batch.failedItems)} aria-label="Invitations traitées"><span style={{ width: `${percent}%` }} /></div>}{batch.status === 'RESERVING' && <p>Réservation de crédits en cours.</p>}<div className="invitation-actions">{funded && batch.totalItems === 1 && batch.completedItems === 1 && <button type="button" className="invitation-download" onClick={() => void downloadSinglePdf(batch.id)}>Télécharger le PDF</button>}{zipReady && <><a className="invitation-download" href={`/api/events/${eventId}/invitations/batches/${batch.id}/download`} onClick={() => setDownloadRequested(true)}>Télécharger le ZIP</a><a href={`/events/${encodeURIComponent(eventId)}/invitations/merci?batch=${encodeURIComponent(batch.id)}`}>Terminer → Merci</a>{zipSize && <small>{zipSize}</small>}{batch.zipExpiresAt && <small>Expire le {formatDateTime(batch.zipExpiresAt)}</small>}</>}{expired && funded && batch.completedItems > 0 && <><span>ZIP expiré ou supprimé</span><button className="invitation-link-button" onClick={() => void api<Batch>(eventId, `invitations/batches/${batch.id}/regenerate`, 'POST', {}).then(load).catch(error => setMessage(error.message))}>Régénérer le ZIP</button></>}{<button className="invitation-link-button" onClick={() => detail ? setBatchDetails(current => { const next = { ...current }; delete next[batch.id]; return next; }) : void api<Batch>(eventId, `invitations/batches/${batch.id}`).then(value => setBatchDetails(current => ({ ...current, [batch.id]: value }))).catch(error => setMessage(error.message))}>{detail ? 'Masquer le détail' : 'Consulter le détail'}</button>}{detail?.items?.filter(item => item.status === 'FAILED').map(item => <p key={item.id} role="status">Invitation en échec : {item.errorCode === 'RENDER_DEPENDENCY_MISSING' ? 'Un outil de préparation est indisponible sur le serveur.' : 'Le fichier n’a pas pu être préparé.'} Référence : {item.errorCode ?? 'RENDER_FAILED'}.</p>)}{(funded ? detail?.items ?? [] : []).filter(item => item.status === 'GENERATED' && item.objectKey).map(item => <a key={item.id} className="invitation-download" href={`/api/events/${eventId}/invitations/batches/${batch.id}/items/${item.id}/download`}>PDF · {guests.find(guest => guest.id === item.guestId)?.fullName ?? 'Invité'}</a>)}{['PARTIAL', 'FAILED'].includes(batch.status) && batch.failedItems > 0 && <button className="invitation-link-button" onClick={() => void api<Batch>(eventId, 'invitations/batches/' + batch.id + '/retry', 'POST', {}).then(load).catch(error => setMessage(error.message))}>Reprendre uniquement les invitations en échec</button>}{cancellable && <button className="invitation-link-button" onClick={() => void api<Batch>(eventId, `invitations/batches/${batch.id}/cancel`, 'POST', {}).then(value => setBatchDetails(current => ({ ...current, [batch.id]: value }))).then(load).catch(error => setMessage(error.message))}>Annuler</button>}</div></article>; })}</div> : <p className="invitation-empty">Aucun lot créé pour cet événement.</p>}
    </div></>}
  </section>;
}
