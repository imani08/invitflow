'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { SeatingMap } from './seating-map';

type Ceremony = { id: string; name: string; ceremonyType: string; startAt: string; timezone: string; status: string };
type Event = { id: string; name: string; status: string; timezone: string; ceremonies: Ceremony[] };
type SeatingMode = 'NO_SEATING' | 'TABLE' | 'ZONE';
type Place = { id: string; name: string; number?: number | null; capacity: number | null; category: string | null; notes: string | null; occupied: number; overCapacity: boolean };
type Assignment = { id: string; guestId: string; tableId: string | null; zoneId: string | null; seatsReserved: number };
type Plan = { ceremonyId: string; mode: SeatingMode; tables: Place[]; zones: Place[]; assignments: Assignment[] };
type Guest = { id: string; fullName: string; group: { name: string } | null; access: { ceremonyId: string; isInvited: boolean; allowedCompanions: number }[] };
type TableImportRow = { rowNumber: number; name: string; number: number | null; capacity: number | null; category: string | null; notes: string | null; errors: string[] };
type TableImportPreview = { id: string; originalName: string; rowCount: number; validCount: number; invalidCount: number; preview: TableImportRow[] };

async function api<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch(`/api/events/${path}`, { method, cache: 'no-store', ...(data !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' ? payload.message : 'La requête a échoué.');
  return payload as T;
}

export function SeatingWorkspace({ event }: { event: Event }) {
  const [ceremonyId, setCeremonyId] = useState(event.ceremonies[0]?.id ?? '');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [searchResults, setSearchResults] = useState<Guest[] | null>(null);
  const [searchingGuests, setSearchingGuests] = useState(false);
  const [modeChoice, setModeChoice] = useState<SeatingMode>('NO_SEATING');
  const [guestSearch, setGuestSearch] = useState('');
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [tableFile, setTableFile] = useState<File | null>(null);
  const [tableImport, setTableImport] = useState<TableImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    if (!ceremonyId) return;
    setLoading(true); setMessage('');
    try {
      const [nextPlan, firstPage] = await Promise.all([
        api<Plan>(`${event.id}/ceremonies/${ceremonyId}/seating`),
        api<{ items: Guest[]; nextCursor: string | null }>(`${event.id}/guests?limit=100`),
      ]);
      const allGuests = [...firstPage.items];
      let cursor = firstPage.nextCursor;
      let pageCount = 1;
      while (cursor && pageCount < 20) {
        const page = await api<{ items: Guest[]; nextCursor: string | null }>(`${event.id}/guests?limit=100&cursor=${encodeURIComponent(cursor)}`);
        allGuests.push(...page.items); cursor = page.nextCursor; pageCount++;
      }
      setPlan(nextPlan); setModeChoice(nextPlan.mode); setGuests(allGuests);
      setMessage(cursor ? `Affichés ${allGuests.length} invités. Utilisez la recherche pour trouver les suivants.` : '');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Chargement impossible.'); }
    finally { setLoading(false); }
  }, [event.id, ceremonyId]);

  useEffect(() => { setTableImport(null); setTableFile(null); setEditingPlaceId(null); void refresh(); }, [refresh]);
  useEffect(() => {
    const query = guestSearch.trim();
    if (query.length < 2) {
      setSearchResults(null);
      setSearchingGuests(false);
      return;
    }
    let cancelled = false;
    setSearchResults(null);
    setSearchingGuests(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const firstPage = await api<{ items: Guest[]; nextCursor: string | null }>(`${event.id}/guests?limit=100&q=${encodeURIComponent(query)}&ceremonyId=${encodeURIComponent(ceremonyId)}`);
          const matches = [...firstPage.items];
          let cursor = firstPage.nextCursor;
          let pageCount = 1;
          while (cursor && pageCount < 20) {
            const page = await api<{ items: Guest[]; nextCursor: string | null }>(`${event.id}/guests?limit=100&q=${encodeURIComponent(query)}&ceremonyId=${encodeURIComponent(ceremonyId)}&cursor=${encodeURIComponent(cursor)}`);
            matches.push(...page.items);
            cursor = page.nextCursor;
            pageCount++;
          }
          if (!cancelled) {
            setSearchResults(matches);
            if (cursor) setMessage(`Plus de 2 000 résultats. Affinez la recherche pour continuer.`);
          }
        } catch (error) {
          if (!cancelled) setMessage(error instanceof Error ? error.message : 'Recherche des invités impossible.');
        } finally {
          if (!cancelled) setSearchingGuests(false);
        }
      })();
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [event.id, ceremonyId, guestSearch]);

  const visibleGuests = searchResults ?? guests;
  const ceremonyAccess = useMemo(() => new Map(visibleGuests.map((guest) => [guest.id, guest.access.find((access) => access.ceremonyId === ceremonyId)])), [visibleGuests, ceremonyId]);
  const eligibleGuests = useMemo(() => visibleGuests.filter((guest) => ceremonyAccess.get(guest.id)?.isInvited && (searchResults !== null || !guestSearch.trim() || guest.fullName.toLocaleLowerCase('fr').includes(guestSearch.trim().toLocaleLowerCase('fr')))), [visibleGuests, ceremonyAccess, guestSearch, searchResults]);
  const guestNames = useMemo(() => new Map([...guests, ...(searchResults ?? [])].map((guest) => [guest.id, guest.fullName])), [guests, searchResults]);

  async function saveMode(eventForm: FormEvent) {
    eventForm.preventDefault(); if (!ceremonyId) return;
    setBusy(true); setMessage('');
    try { await api(`${event.id}/ceremonies/${ceremonyId}/seating`, 'PUT', { mode: modeChoice }); await refresh(); setMessage('Mode de placement enregistré.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Enregistrement impossible.'); }
    finally { setBusy(false); }
  }

  async function createPlace(eventForm: FormEvent<HTMLFormElement>, kind: 'tables' | 'zones') {
    eventForm.preventDefault(); const formElement = eventForm.currentTarget; const form = new FormData(formElement); setBusy(true); setMessage('');
    try {
      const input = { name: form.get('name'), ...(kind === 'tables' ? { number: form.get('number') ? Number(form.get('number')) : null } : {}), capacity: form.get('capacity') ? Number(form.get('capacity')) : null, category: form.get('category') || null, notes: form.get('notes') || null };
      await api(`${event.id}/ceremonies/${ceremonyId}/seating/${kind}`, 'POST', input);
      formElement.reset(); await refresh(); setMessage(kind === 'tables' ? 'Table ajoutée.' : 'Zone ajoutée.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Création impossible.'); }
    finally { setBusy(false); }
  }

  async function removePlace(kind: 'tables' | 'zones', place: Place) {
    if (plan?.assignments.some((assignment) => assignment.tableId === place.id || assignment.zoneId === place.id) && !window.confirm(`Supprimer ${place.name} et ses affectations ?`)) return;
    setBusy(true); setMessage('');
    try { await api(`${event.id}/ceremonies/${ceremonyId}/seating/${kind}/${place.id}`, 'DELETE'); await refresh(); setMessage('Élément supprimé.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Suppression impossible.'); }
    finally { setBusy(false); }
  }

  async function updatePlace(eventForm: FormEvent<HTMLFormElement>, kind: 'tables' | 'zones', place: Place) {
    eventForm.preventDefault(); const form = new FormData(eventForm.currentTarget); setBusy(true); setMessage('');
    try {
      await api(`${event.id}/ceremonies/${ceremonyId}/seating/${kind}/${place.id}`, 'PATCH', {
        name: form.get('name'), ...(kind === 'tables' ? { number: form.get('number') ? Number(form.get('number')) : null } : {}),
        capacity: form.get('capacity') ? Number(form.get('capacity')) : null,
      });
      setEditingPlaceId(null); await refresh(); setMessage('Élément mis à jour.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Modification impossible.'); }
    finally { setBusy(false); }
  }

  async function assignToTarget(guestId: string, targetId: string): Promise<boolean> {
    if (busy || !plan || plan.mode === 'NO_SEATING') return false;
    setBusy(true); setMessage('');
    try {
      const field = plan.mode === 'TABLE' ? 'tableId' : 'zoneId';
      const result = await api<Assignment & { overCapacity: boolean }>(`${event.id}/ceremonies/${ceremonyId}/seating/assignments`, 'POST', { guestId, [field]: targetId });
      await refresh(); setMessage(result.overCapacity ? 'Affectation enregistrée, mais la capacité est dépassée.' : 'Invité placé.');
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Affectation impossible.'); return false; }
    finally { setBusy(false); }
  }

  async function assign(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); const formElement = formEvent.currentTarget; const form = new FormData(formElement); const guestId = String(form.get('guestId') ?? ''); const targetId = String(form.get('targetId') ?? '');
    if (guestId && targetId && await assignToTarget(guestId, targetId)) formElement.reset();
  }

  async function unassign(guestId: string) {
    setBusy(true); setMessage('');
    try { await api(`${event.id}/ceremonies/${ceremonyId}/seating/assignments/${guestId}`, 'DELETE'); await refresh(); setMessage('Affectation retirée.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Suppression impossible.'); }
    finally { setBusy(false); }
  }

  async function uploadTables(eventForm: FormEvent) {
    eventForm.preventDefault(); if (!tableFile) return;
    setBusy(true); setMessage('');
    try {
      const form = new FormData(); form.append('file', tableFile, tableFile.name);
      const response = await fetch(`/api/events/${event.id}/ceremonies/${ceremonyId}/seating/imports`, { method: 'POST', body: form, cache: 'no-store' });
      const result: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result && typeof result === 'object' && 'message' in result && typeof result.message === 'string' ? result.message : 'Analyse du fichier impossible.');
      setTableImport(result as TableImportPreview); setMessage('Vérifiez l’aperçu avant de confirmer l’import.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Analyse du fichier impossible.'); }
    finally { setBusy(false); }
  }

  async function commitTables() {
    if (!tableImport) return;
    setBusy(true); setMessage('');
    try {
      const result = await api<{ importedCount: number }>(`${event.id}/ceremonies/${ceremonyId}/seating/imports/${tableImport.id}/commit`, 'POST', {});
      setTableImport(null); setTableFile(null); await refresh(); setMessage(`${result.importedCount} table(s) importée(s).`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Import impossible.'); }
    finally { setBusy(false); }
  }

  const places = plan?.mode === 'TABLE' ? plan.tables : plan?.mode === 'ZONE' ? plan.zones : [];
  const targetName = (assignment: Assignment) => places.find((place) => place.id === (assignment.tableId ?? assignment.zoneId))?.name ?? 'Élément supprimé';

  if (event.ceremonies.length === 0) return <section className="seating-empty"><h2>Aucune cérémonie à organiser</h2><p>Ajoutez d’abord une cérémonie à votre événement.</p><a href="/events">Retour aux événements</a></section>;

  return <section className="seating-workspace">
    <div className="seating-toolbar"><label>Cérémonie<select value={ceremonyId} onChange={(change) => setCeremonyId(change.target.value)}>{event.ceremonies.map((ceremony) => <option key={ceremony.id} value={ceremony.id}>{ceremony.name}</option>)}</select></label><span aria-live="polite">{searchingGuests ? 'Recherche des invités…' : searchResults ? `${eligibleGuests.length} résultat(s)` : guestSearch.trim().length === 1 ? 'Saisissez 2 caractères pour rechercher tous les invités.' : `${guests.length} invité(s) chargé(s)`}{loading ? ' · actualisation…' : ''}</span></div>
    {message && <p className="seating-message" role="status">{message}</p>}
    {plan && <>
      <form className="seating-mode-card" onSubmit={(form) => void saveMode(form)}><div><p className="eyebrow">ORGANISATION</p><h2>Choisissez le plan de salle</h2><p>Les places incluent l’invité et les accompagnants autorisés pour cette cérémonie.</p></div><div className="seating-mode-controls"><select value={modeChoice} onChange={(change) => setModeChoice(change.target.value as SeatingMode)}><option value="NO_SEATING">Sans placement</option><option value="TABLE">Par table</option><option value="ZONE">Par zone</option></select><button disabled={busy || modeChoice === plan.mode}>Enregistrer</button></div></form>
      {plan.mode !== 'NO_SEATING' && <>
        <SeatingMap mode={plan.mode} places={places} assignments={plan.assignments} guests={eligibleGuests} guestNames={guestNames} onAssign={assignToTarget} />
        <div className="seating-columns"><section className="seating-panel"><div className="seating-panel-head"><div><p className="eyebrow">{plan.mode === 'TABLE' ? 'TABLES' : 'ZONES'}</p><h2>{plan.mode === 'TABLE' ? 'Capacités' : 'Espaces'}</h2></div><span>{places.length}</span></div>
          {plan.mode === 'TABLE' && <form className="seating-import-form" onSubmit={(form) => void uploadTables(form)}><label>Importer les tables (.csv ou .xlsx)<input type="file" accept=".csv,.xlsx" onChange={(change) => setTableFile(change.target.files?.[0] ?? null)} /></label><button disabled={busy || !tableFile}>Analyser</button></form>}
          {tableImport && <div className="seating-import-preview"><strong>{tableImport.originalName} · {tableImport.validCount}/{tableImport.rowCount} lignes valides</strong><div>{tableImport.preview.map((row) => <p key={row.rowNumber}>Ligne {row.rowNumber} · {row.name || 'Sans nom'} · {row.capacity ?? '—'} places{row.errors.length ? ` · ${row.errors.join(', ')}` : ''}</p>)}</div><button disabled={busy || tableImport.invalidCount > 0} onClick={() => void commitTables()}>Confirmer l’import</button><button type="button" onClick={() => setTableImport(null)}>Annuler</button></div>}
          <form className="seating-create-form" onSubmit={(form) => void createPlace(form, plan.mode === 'TABLE' ? 'tables' : 'zones')}><input name="name" placeholder={plan.mode === 'TABLE' ? 'Nom de la table' : 'Nom de la zone'} maxLength={100} required />{plan.mode === 'TABLE' && <input name="number" type="number" min="1" max="10000" placeholder="N°" />}{plan.mode === 'TABLE' && <input name="capacity" type="number" min="1" max="500" placeholder="Places" required />}{plan.mode === 'ZONE' && <input name="capacity" type="number" min="1" max="500" placeholder="Capacité facultative" />}<input name="category" placeholder="Catégorie" maxLength={80} /><button disabled={busy}>Ajouter</button></form>
          <div className="seating-place-list">{places.length === 0 ? <p className="seating-muted">Aucun élément. Créez la première ligne ci-dessus.</p> : places.map((place) => <article className={`seating-place ${place.overCapacity ? 'over' : ''}`} key={place.id}>{editingPlaceId === place.id ? <form className="seating-edit-form" onSubmit={(form) => void updatePlace(form, plan.mode === 'TABLE' ? 'tables' : 'zones', place)}><input name="name" defaultValue={place.name} maxLength={100} required />{plan.mode === 'TABLE' && <input name="number" type="number" min="1" max="10000" defaultValue={place.number ?? ''} placeholder="N°" />}<input name="capacity" type="number" min="1" max="500" defaultValue={place.capacity ?? ''} placeholder="Capacité" required={plan.mode === 'TABLE'} /><button disabled={busy}>Enregistrer</button><button type="button" onClick={() => setEditingPlaceId(null)}>Annuler</button></form> : <><div><strong>{place.number ? `N° ${place.number} · ` : ''}{place.name}</strong><span>{place.occupied} placé(s){place.capacity !== null ? ` / ${place.capacity} places` : ''}{place.overCapacity ? ' · capacité dépassée' : ''}</span>{place.category && <small>{place.category}</small>}</div><div className="seating-place-actions"><button onClick={() => setEditingPlaceId(place.id)} disabled={busy}>Modifier</button><button aria-label={`Supprimer ${place.name}`} onClick={() => void removePlace(plan.mode === 'TABLE' ? 'tables' : 'zones', place)} disabled={busy}>×</button></div></>}</article>)}</div>
        </section>
        <section className="seating-panel"><div className="seating-panel-head"><div><p className="eyebrow">AFFECTATIONS</p><h2>Placer les invités</h2></div><span>{plan.assignments.length}</span></div>
          <form className="seating-assign-form" onSubmit={(form) => void assign(form)}><label>Filtrer les invités autorisés<input value={guestSearch} onChange={(change) => setGuestSearch(change.target.value)} placeholder="Nom ou partie du nom" autoComplete="off" /></label><label>Invité à placer ou déplacer<select name="guestId" required defaultValue=""><option value="" disabled>Choisir un invité autorisé</option>{eligibleGuests.map((guest) => { const existing = plan.assignments.find((assignment) => assignment.guestId === guest.id); return <option key={guest.id} value={guest.id}>{guest.fullName}{guest.group ? ` · ${guest.group.name}` : ''} · {1 + (ceremonyAccess.get(guest.id)?.allowedCompanions ?? 0)} place(s){existing ? ` · déjà placé: ${targetName(existing)}` : ''}</option>; })}</select></label><label>{plan.mode === 'TABLE' ? 'Table' : 'Zone'}<select name="targetId" required defaultValue=""><option value="" disabled>Choisir une destination</option>{places.map((place) => <option key={place.id} value={place.id}>{place.name}{place.capacity !== null ? ` · ${place.occupied}/${place.capacity}` : ''}</option>)}</select></label><button disabled={busy || eligibleGuests.length === 0 || places.length === 0}>Affecter / déplacer</button></form>
          <div className="seating-assignment-list">{plan.assignments.length === 0 ? <p className="seating-muted">Aucune affectation pour le moment.</p> : plan.assignments.map((assignment) => <article className="seating-assignment" key={assignment.id}><div><strong>{guestNames.get(assignment.guestId) ?? `Invité ${assignment.guestId.slice(0, 8)}`}</strong><span>{targetName(assignment)} · {assignment.seatsReserved} place(s) réservée(s)</span></div><button onClick={() => void unassign(assignment.guestId)} disabled={busy}>Retirer</button></article>)}</div>
        </section></div>
      </>}
    </>}
  </section>;
}
