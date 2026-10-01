'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Ceremony = { id: string; name: string; ceremonyType: string; startAt: string; timezone: string; status: string };
type Event = { id: string; name: string; status: string; timezone: string; ceremonies: Ceremony[] };
type Access = { ceremonyId: string; isInvited: boolean; allowedCompanions: number; category?: string | null; notes?: string | null };
type Guest = { id: string; fullName: string; email: string | null; phone: string | null; notes: string | null; group: { id: string; name: string } | null; companions: { id: string; fullName: string; relationship: string | null }[]; access: Access[] };
type Group = { id: string; name: string; _count: { guests: number } };
type Mapping = { fullName?: number; firstName?: number; lastName?: number; email?: number; phone?: number; groupName?: number; notes?: number; allowedCompanions?: number; ceremonyColumns?: Record<string, number>; ceremonyCompanionColumns?: Record<string, number> };
type MappingFieldKey = Exclude<keyof Mapping, 'ceremonyColumns' | 'ceremonyCompanionColumns'>;
type Preview = { rowNumber: number; fullName: string; email: string | null; phone: string | null; groupName: string | null; notes: string | null; allowedCompanions: number; errors: string[] };
type ImportAnalysis = { id: string; originalName: string; columns: { index: number; label: string }[]; suggestedMapping: Mapping; rowCount: number };
type ImportPreview = { rowCount: number; validCount: number; invalidCount: number; preview: Preview[] };

async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/api/events/${path}`, { method, cache: 'no-store', ...(data !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' ? payload.message : 'La requête a échoué.');
  return payload as T;
}

const fields: { key: MappingFieldKey; label: string; required?: boolean }[] = [
  { key: 'fullName', label: 'Nom complet' }, { key: 'firstName', label: 'Prénom' }, { key: 'lastName', label: 'Nom de famille' }, { key: 'email', label: 'E-mail' }, { key: 'phone', label: 'Téléphone' },
  { key: 'groupName', label: 'Groupe' }, { key: 'notes', label: 'Notes' }, { key: 'allowedCompanions', label: 'Accompagnants autorisés' },
];

export function GuestsWorkspace({ event }: { event: Event }) {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [totalGuests, setTotalGuests] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Guest | null>(null);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [ceremonyFilter, setCeremonyFilter] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [ceremonyIds, setCeremonyIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importDone, setImportDone] = useState<{ importedCount: number; skippedCount: number } | null>(null);

  const refresh = useCallback(async () => {
    const params = new URLSearchParams({ limit: '100' });
    if (query.trim()) params.set('q', query.trim());
    if (groupFilter) params.set('groupId', groupFilter);
    if (ceremonyFilter) params.set('ceremonyId', ceremonyFilter);
    const [groupResult, firstPage] = await Promise.all([
      api<Group[]>(`${event.id}/guests/groups`), api<{ items: Guest[]; nextCursor: string | null; total: number }>(`${event.id}/guests?${params}`),
    ]);
    setGuests(firstPage.items); setTotalGuests(firstPage.total); setNextCursor(firstPage.nextCursor); setGroups(groupResult); setLoaded(true);
  }, [event.id, query, groupFilter, ceremonyFilter]);

  useEffect(() => { const timer = window.setTimeout(() => setQuery(filter), 250); return () => window.clearTimeout(timer); }, [filter]);
  useEffect(() => { void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Chargement impossible.')); }, [refresh]);
  async function loadMore() {
    if (!nextCursor) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({ limit: '100', cursor: nextCursor });
      if (query.trim()) params.set('q', query.trim());
      if (groupFilter) params.set('groupId', groupFilter);
      if (ceremonyFilter) params.set('ceremonyId', ceremonyFilter);
      const page = await api<{ items: Guest[]; nextCursor: string | null }>(`${event.id}/guests?${params}`);
      setGuests((current) => [...current, ...page.items]); setNextCursor(page.nextCursor);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Chargement impossible.'); }
    finally { setBusy(false); }
  }

  async function submitGuest(form: FormData) {
    setBusy(true); setMessage('');
    const checked = new Set(form.getAll('ceremonyId').map(String));
    const access = event.ceremonies.filter((ceremony) => checked.has(ceremony.id)).map((ceremony) => ({ ceremonyId: ceremony.id, isInvited: true, allowedCompanions: Math.max(0, Math.min(20, Number(form.get(`companions-${ceremony.id}`)) || 0)) }));
    const companions = String(form.get('companions') ?? '').split('\n').map((name) => name.trim()).filter(Boolean).map((fullName) => ({ fullName }));
    try {
      const input = { fullName: form.get('fullName'), email: form.get('email') || null, phone: form.get('phone') || null, groupName: form.get('groupName') || null, notes: form.get('notes') || null, companions, access };
      if (selected) await api(`${event.id}/guests/${selected.id}`, 'PATCH', input);
      else await api(`${event.id}/guests`, 'POST', input);
      await refresh(); setSelected(null); setMessage(selected ? 'Invité mis à jour.' : 'Invité ajouté.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }

  async function archive(guest: Guest) {
    if (!window.confirm(`Archiver ${guest.fullName} ?`)) return;
    setBusy(true); setMessage('');
    try { await api(`${event.id}/guests/${guest.id}`, 'DELETE'); await refresh(); if (selected?.id === guest.id) setSelected(null); setMessage('Invité archivé.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Archivage impossible.'); }
    finally { setBusy(false); }
  }

  async function addGroup(form: FormEvent<HTMLFormElement>) {
    form.preventDefault(); setBusy(true); setMessage('');
    try { await api(`${event.id}/guests/groups`, 'POST', { name: groupName }); setGroupName(''); await refresh(); setMessage('Groupe créé.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Création du groupe impossible.'); }
    finally { setBusy(false); }
  }

  async function renameGroup(group: Group) {
    const name = window.prompt('Nouveau nom du groupe', group.name)?.trim();
    if (!name || name === group.name) return;
    setBusy(true);
    try { await api(`${event.id}/guests/groups/${group.id}`, 'PATCH', { name }); await refresh(); setMessage('Groupe renommé.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Modification du groupe impossible.'); }
    finally { setBusy(false); }
  }

  async function deleteGroup(group: Group) {
    if (!window.confirm(`Supprimer le groupe « ${group.name} » ? Les invités resteront dans la liste.`)) return;
    setBusy(true);
    try { await api(`${event.id}/guests/groups/${group.id}`, 'DELETE'); if (groupFilter === group.id) setGroupFilter(''); await refresh(); setMessage('Groupe supprimé.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Suppression du groupe impossible.'); }
    finally { setBusy(false); }
  }

  async function analyzeUpload() {
    if (!file) return;
    setBusy(true); setMessage(''); setPreview(null); setImportDone(null);
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch(`/api/events/${event.id}/guest-imports`, { method: 'POST', body: form });
      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' ? payload.message : 'Analyse du fichier impossible.');
      const result = payload as ImportAnalysis; setAnalysis(result); setMapping(result.suggestedMapping); setMessage(`${result.rowCount} ligne(s) détectée(s) dans « ${result.originalName} ».`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Analyse du fichier impossible.'); }
    finally { setBusy(false); }
  }

  async function previewImport() {
    if (!analysis || !mapping) return;
    setBusy(true); setMessage('');
    try { setPreview(await api(`${event.id}/guest-imports/${analysis.id}/mapping`, 'PUT', { mapping, ceremonyIds })); setMessage('Vérifiez les lignes avant de confirmer l’import.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Prévisualisation impossible.'); }
    finally { setBusy(false); }
  }

  async function commitImport() {
    if (!analysis || !preview || preview.validCount === 0 || !window.confirm(`Importer ${preview.validCount} invité(s) et ignorer ${preview.invalidCount} ligne(s) invalide(s) ?`)) return;
    setBusy(true); setMessage('');
    try { const result = await api<{ importedCount: number; skippedCount: number }>(`${event.id}/guest-imports/${analysis.id}/commit`, 'POST', {}); setImportDone(result); setAnalysis(null); setPreview(null); setFile(null); await refresh(); setMessage(`${result.importedCount} invité(s) importé(s), ${result.skippedCount} ignoré(s).`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Validation de l’import impossible.'); }
    finally { setBusy(false); }
  }

  return <section className="guests-layout">
    <div>
      <section className="guest-panel"><div className="events-list-head"><div><p className="eyebrow">LISTE DE PRÉSENCE</p><h2>Invités <span>{totalGuests.toString().padStart(2, '0')}</span></h2></div><button className="small-action" onClick={() => setSelected(null)}>+ Ajouter</button></div>
        <p className="guests-status" role="status" aria-live="polite">{message}</p>
        <div className="guest-toolbar"><input aria-label="Rechercher un invité" placeholder="Rechercher un nom, e-mail ou téléphone" value={filter} onChange={(e) => setFilter(e.target.value)} /><select aria-label="Filtrer par groupe" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}><option value="">Tous les groupes</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select><select aria-label="Filtrer par cérémonie" value={ceremonyFilter} onChange={(e) => setCeremonyFilter(e.target.value)}><option value="">Toutes les cérémonies</option>{event.ceremonies.map((ceremony) => <option value={ceremony.id} key={ceremony.id}>{ceremony.name}</option>)}</select></div>
        {!loaded ? <p className="guest-empty">Chargement des invités…</p> : guests.length === 0 ? <p className="guest-empty">{totalGuests ? 'Aucun invité ne correspond à cette recherche.' : 'Votre liste commence ici. Ajoutez un invité ou importez un fichier.'}</p> : <><div className="guest-list">{guests.map((guest) => <div className="guest-row" key={guest.id}><button onClick={() => setSelected(guest)}><strong>{guest.fullName}</strong><span>{guest.email || guest.phone || 'Aucun contact'}{guest.group ? ` · ${guest.group.name}` : ''}</span></button><div className="guest-row-actions"><button onClick={() => setSelected(guest)} disabled={busy}>Modifier</button><button onClick={() => void archive(guest)} disabled={busy}>Archiver</button></div></div>)}</div>{nextCursor && <button className="small-action" onClick={() => void loadMore()} disabled={busy}>Charger les invités suivants</button>}</>}
        <form className="group-row" onSubmit={addGroup}><input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Créer un groupe (ex. Famille)" maxLength={100} required /><button className="small-action" disabled={busy}>Créer</button></form>
        {groups.length > 0 && <div className="guest-list">{groups.map((group) => <div className="guest-row" key={group.id}><button onClick={() => setGroupFilter(group.id)}><strong>{group.name}</strong><span>{group._count.guests} invité(s)</span></button><div className="guest-row-actions"><button onClick={() => void renameGroup(group)} disabled={busy}>Renommer</button><button onClick={() => void deleteGroup(group)} disabled={busy}>Supprimer</button></div></div>)}</div>}
      </section>
      <section className="import-panel"><p className="eyebrow">IMPORTER UNE LISTE</p><h2>Ajouter depuis un fichier</h2><p>Formats CSV ou XLSX, 5 Mo maximum et jusqu’à 1 000 lignes invité. Les formules sont signalées pendant la prévisualisation.</p>
        <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setAnalysis(null); setPreview(null); setImportDone(null); }} />
        <button onClick={() => void analyzeUpload()} disabled={busy || !file}>Analyser le fichier</button>
        {analysis && mapping && <><h3>Associer les colonnes · {analysis.rowCount} lignes</h3><div className="mapping-grid">{fields.map((field) => <label key={field.key}>{field.label}{field.required ? ' *' : ''}<select value={mapping[field.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value === '' ? undefined : Number(e.target.value) })}><option value="">Ignorer</option>{analysis.columns.map((column) => <option key={column.index} value={column.index}>{column.label || `Colonne ${column.index + 1}`}</option>)}</select></label>)}</div>
          <p className="import-hint">Sélectionnez les cérémonies. Sans colonne Oui/Non, chaque invité valide sera invité aux cérémonies cochées. Une colonne permet de personnaliser l’accès par invité.</p><div className="import-ceremonies">{event.ceremonies.map((ceremony) => <label key={ceremony.id}><input type="checkbox" checked={ceremonyIds.includes(ceremony.id)} onChange={(e) => setCeremonyIds(e.target.checked ? [...ceremonyIds, ceremony.id] : ceremonyIds.filter((id) => id !== ceremony.id))} /> {ceremony.name}</label>)}</div>
          {event.ceremonies.filter((ceremony) => ceremonyIds.includes(ceremony.id)).map((ceremony) => <div className="mapping-grid" key={ceremony.id}><label>Accès · {ceremony.name}<select value={mapping.ceremonyColumns?.[ceremony.id] ?? ''} onChange={(e) => { const ceremonyColumns = { ...mapping.ceremonyColumns }; if (e.target.value === '') delete ceremonyColumns[ceremony.id]; else ceremonyColumns[ceremony.id] = Number(e.target.value); setMapping({ ...mapping, ceremonyColumns }); }}><option value="">Tous les invités valides</option>{analysis.columns.map((column) => <option key={column.index} value={column.index}>{column.label || `Colonne ${column.index + 1}`}</option>)}</select></label><label>Accompagnants · {ceremony.name}<select value={mapping.ceremonyCompanionColumns?.[ceremony.id] ?? ''} onChange={(e) => { const ceremonyCompanionColumns = { ...mapping.ceremonyCompanionColumns }; if (e.target.value === '') delete ceremonyCompanionColumns[ceremony.id]; else ceremonyCompanionColumns[ceremony.id] = Number(e.target.value); setMapping({ ...mapping, ceremonyCompanionColumns }); }}><option value="">Utiliser la valeur générale</option>{analysis.columns.map((column) => <option key={column.index} value={column.index}>{column.label || `Colonne ${column.index + 1}`}</option>)}</select></label></div>)}
          <button onClick={() => void previewImport()} disabled={busy || ![mapping.fullName, mapping.firstName, mapping.lastName].some(Number.isInteger)}>Prévisualiser</button></>}
        {preview && <><p>{preview.validCount} valide(s) · {preview.invalidCount} à corriger ou ignorer</p><div className="preview-scroll"><table className="preview-table"><thead><tr><th>Ligne</th><th>Nom</th><th>E-mail</th><th>Groupe</th><th>Résultat</th></tr></thead><tbody>{preview.preview.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.fullName}</td><td>{row.email ?? '—'}</td><td>{row.groupName ?? '—'}</td><td className={row.errors.length ? 'preview-errors' : ''}>{row.errors.join(', ') || 'Prête'}</td></tr>)}</tbody></table></div><button onClick={() => void commitImport()} disabled={busy || preview.validCount === 0}>Confirmer l’import</button></>}
        {importDone && <p role="status">Import terminé : {importDone.importedCount} ajouté(s), {importDone.skippedCount} ignoré(s).</p>}
      </section>
    </div>
    <aside className="guest-panel"><p className="eyebrow">FICHE INVITÉ</p><h2>{selected ? 'Modifier un invité' : 'Nouvel invité'}</h2>
      <form key={selected?.id ?? 'new'} className="guest-form" onSubmit={(e) => { e.preventDefault(); void submitGuest(new FormData(e.currentTarget)); }}>
        <input name="fullName" placeholder="Nom complet *" defaultValue={selected?.fullName ?? ''} minLength={2} maxLength={160} required />
        <input name="email" type="email" placeholder="Adresse e-mail" defaultValue={selected?.email ?? ''} maxLength={320} />
        <input name="phone" type="tel" placeholder="Téléphone" defaultValue={selected?.phone ?? ''} maxLength={40} />
        <select name="groupName" defaultValue={selected?.group?.name ?? ''}><option value="">Sans groupe</option>{groups.map((group) => <option value={group.name} key={group.id}>{group.name}</option>)}</select>
        <textarea name="notes" placeholder="Notes" defaultValue={selected?.notes ?? ''} maxLength={2000} />
        <label>Accompagnants (un nom par ligne)<textarea name="companions" defaultValue={selected?.companions.map((companion) => companion.fullName).join('\n') ?? ''} placeholder="Nom de l’accompagnant" /></label>
        <h3>Accès aux cérémonies</h3>
        {event.ceremonies.length === 0 ? <p className="import-hint">Ajoutez d’abord une cérémonie au programme de l’événement.</p> : <div className="ceremony-access">{event.ceremonies.map((ceremony) => { const access = selected?.access.find((item) => item.ceremonyId === ceremony.id); return <label key={ceremony.id}><input type="checkbox" name="ceremonyId" value={ceremony.id} defaultChecked={access?.isInvited ?? false} /><span>{ceremony.name}</span><input type="number" name={`companions-${ceremony.id}`} aria-label={`Accompagnants autorisés pour ${ceremony.name}`} min="0" max="20" defaultValue={access?.allowedCompanions ?? 0} /></label>; })}</div>}
        <button className="guest-save" disabled={busy || event.status === 'CANCELLED'}>{busy ? 'Enregistrement…' : selected ? 'Enregistrer les changements' : 'Ajouter à la liste'}</button>
        {selected && <button type="button" className="cancel-action" onClick={() => setSelected(null)}>Annuler la modification</button>}
      </form>
    </aside>
  </section>;
}
