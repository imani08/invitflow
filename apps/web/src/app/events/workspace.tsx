'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { Ceremony, CeremonyProgramItem, Event } from './types';
import { formatDateTimeInTimeZone } from '@/lib/date-format.mjs';

const typeLabels: Record<string, string> = { WEDDING: 'Mariage', BIRTHDAY: 'Anniversaire', GRADUATION: 'Graduation', BAPTISM: 'Baptême', BABY_SHOWER: 'Baby shower', CONFERENCE: 'Conférence', GALA: 'Gala', DINNER: 'Dîner', CORPORATE: 'Événement professionnel', CEREMONY: 'Cérémonie', RELIGIOUS: 'Cérémonie religieuse', ANNIVERSARY: 'Anniversaire de mariage', OTHER: 'Autre' };
const statusLabels: Record<string, string> = { DRAFT: 'Brouillon', PUBLISHED: 'Publié', CANCELLED: 'Annulé', COMPLETED: 'Terminé' };

async function api(path: string, method = 'GET', data?: Record<string, unknown>) {
  const response = await fetch(`/api/events/${path}`, { method, ...(data !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result && typeof result === 'object' && 'message' in result && typeof result.message === 'string' ? result.message : 'Une erreur est survenue.');
  return result;
}

function localDate(value: string | null, timeZone = 'Africa/Kinshasa') {
  return value ? formatDateTimeInTimeZone(value, timeZone) : 'Date à préciser';
}

function localTimeInZone(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/.exec(value);
  if (!match) throw new Error('Saisissez une date et une heure valides.');
  const target = match.slice(1).map(Number);
  const targetUtc = Date.UTC(target[0]!, target[1]! - 1, target[2]!, target[3]!, target[4]!);
  let candidate = targetUtc;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const representedUtc = Date.UTC(Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']), Number(parts['hour']), Number(parts['minute']));
    const adjustment = targetUtc - representedUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  const result = formatter.formatToParts(new Date(candidate)).reduce<Record<string, string>>((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  if (Number(result['year']) !== target[0]! || Number(result['month']) !== target[1]! || Number(result['day']) !== target[2]! || Number(result['hour']) !== target[3]! || Number(result['minute']) !== target[4]!) {
    throw new Error('Cette heure n’existe pas dans le fuseau choisi à cause du changement d’heure.');
  }
  return new Date(candidate).toISOString();
}

function dateTimeInput(value: string | null, timeZone: string) {
  if (!value) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}`;
}

function CeremonyProgramEditor({ eventId, ceremony, editable, onRefresh, onMessage }: { eventId: string; ceremony: Ceremony; editable: boolean; onRefresh: () => Promise<void>; onMessage: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function mutate(path: string, method: string, data: Record<string, unknown> | undefined, success: string) {
    setBusy(true); setError('');
    try { await api(path, method, data); await onRefresh(); setEditing(null); onMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'La modification du déroulement a échoué.'); }
    finally { setBusy(false); }
  }
  function submitAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const startsAt = String(form.get('startsAt') ?? '');
    void mutate(`${eventId}/ceremonies/${ceremony.id}/program`, 'POST', { title: form.get('title'), description: form.get('description') || null, location: form.get('location') || null, ...(startsAt ? { startsAt: localTimeInZone(startsAt, ceremony.timezone) } : {}), durationMinutes: form.get('durationMinutes') ? Number(form.get('durationMinutes')) : null }, 'Étape ajoutée au déroulement.');
    event.currentTarget.reset();
  }
  function submitUpdate(event: FormEvent<HTMLFormElement>, item: CeremonyProgramItem) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const startsAt = String(form.get('startsAt') ?? '');
    void mutate(`${eventId}/ceremonies/${ceremony.id}/program/${item.id}`, 'PATCH', { title: form.get('title'), description: form.get('description') || null, location: form.get('location') || null, startsAt: startsAt ? localTimeInZone(startsAt, ceremony.timezone) : null, durationMinutes: form.get('durationMinutes') ? Number(form.get('durationMinutes')) : null }, 'Étape mise à jour.');
  }
  function reorder(index: number, delta: -1 | 1) {
    const next = ceremony.programItems.map((item) => item.id); const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    void mutate(`${eventId}/ceremonies/${ceremony.id}/program/order`, 'PATCH', { itemIds: next }, 'Ordre du déroulement enregistré.');
  }
  function remove(item: CeremonyProgramItem) {
    if (!window.confirm(`Supprimer l’étape « ${item.title} » ?`)) return;
    void mutate(`${eventId}/ceremonies/${ceremony.id}/program/${item.id}`, 'DELETE', undefined, 'Étape supprimée.');
  }
  return <section className="ceremony-program" aria-label={`Déroulement de ${ceremony.name}`} aria-busy={busy}>
    <div className="program-heading"><strong>Déroulement de la cérémonie</strong><span>{ceremony.programItems.length}/50 étapes</span></div>
    {ceremony.programItems.length === 0 ? <p className="program-empty">Aucune étape planifiée. Ajoutez les moments importants dans leur ordre prévu.</p> : <ol className="program-list">{ceremony.programItems.map((item, index) => <li className="program-item" key={item.id}>
      {editing === item.id ? <form className="program-form" onSubmit={(event) => submitUpdate(event, item)}><strong>Modifier l’étape {index + 1}</strong><input name="title" aria-label="Titre de l’étape" defaultValue={item.title} minLength={2} maxLength={120} required /><div className="form-pair"><input name="startsAt" aria-label="Heure prévue" type="datetime-local" defaultValue={dateTimeInput(item.startsAt, ceremony.timezone)} /><input name="durationMinutes" aria-label="Durée en minutes" type="number" min="1" max="1440" placeholder="Durée (min)" defaultValue={item.durationMinutes ?? ''} /></div><input name="location" aria-label="Lieu de l’étape" placeholder="Lieu (facultatif)" maxLength={300} defaultValue={item.location ?? ''} /><textarea name="description" aria-label="Description de l’étape" placeholder="Description (facultative)" maxLength={1000} defaultValue={item.description ?? ''} /><div className="program-actions"><button type="submit" disabled={busy}>Enregistrer</button><button type="button" onClick={() => setEditing(null)} disabled={busy}>Annuler</button></div></form> : <>
        <div className="program-item-content"><span className="program-position">{index + 1}</span><div><strong>{item.title}</strong><span>{item.startsAt ? localDate(item.startsAt, ceremony.timezone) : 'Heure à préciser'}{item.durationMinutes ? ` · ${item.durationMinutes} min` : ''}{item.location ? ` · ${item.location}` : ''}</span>{item.description && <p>{item.description}</p>}</div></div>
        {editable && <div className="program-actions"><button type="button" aria-label={`Monter ${item.title}`} title="Monter" onClick={() => reorder(index, -1)} disabled={busy || index === 0}>↑</button><button type="button" aria-label={`Descendre ${item.title}`} title="Descendre" onClick={() => reorder(index, 1)} disabled={busy || index === ceremony.programItems.length - 1}>↓</button><button type="button" onClick={() => setEditing(item.id)} disabled={busy}>Modifier</button><button type="button" onClick={() => remove(item)} disabled={busy}>Supprimer</button></div>}
      </>}
    </li>)}</ol>}
    {error && <p className="program-error" role="alert">{error}</p>}
    {editable && ceremony.programItems.length < 50 && <form className="program-form program-add-form" onSubmit={submitAdd}><strong>Ajouter une étape</strong><input name="title" aria-label="Titre de la nouvelle étape" placeholder="Ex. Accueil des invités" minLength={2} maxLength={120} required /><div className="form-pair"><input name="startsAt" aria-label="Heure prévue" type="datetime-local" /><input name="durationMinutes" aria-label="Durée en minutes" type="number" min="1" max="1440" placeholder="Durée (min)" /></div><input name="location" aria-label="Lieu de l’étape" placeholder="Lieu (facultatif)" maxLength={300} /><textarea name="description" aria-label="Description de l’étape" placeholder="Description (facultative)" maxLength={1000} /><button className="small-action" disabled={busy}>{busy ? 'Enregistrement…' : 'Ajouter au déroulement'}</button></form>}
  </section>;
}

export function EventsWorkspace({ initialEvents, expandedEventId }: { initialEvents: Event[]; expandedEventId: string | undefined }) {
  const [events, setEvents] = useState(initialEvents);
  const [expanded, setExpanded] = useState<string | null>(expandedEventId ?? null);
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [editingCeremony, setEditingCeremony] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const openCreateFromHash = () => {
      if (window.location.hash !== '#create-event') return;
      setCreating(true);
      window.requestAnimationFrame(() => {
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
        document.getElementById('create-event')?.scrollIntoView({ behavior, block: 'start' });
      });
    };
    openCreateFromHash();
    window.addEventListener('hashchange', openCreateFromHash);
    return () => window.removeEventListener('hashchange', openCreateFromHash);
  }, []);

  async function refresh() {
    const result = await api('?limit=50') as { items: Event[] };
    setEvents(result.items);
  }

  async function createEvent(form: FormData) {
    setBusy(true); setMessage('');
    try {
      const timezone = String(form.get('timezone'));
      const start = String(form.get('startAt') ?? '');
      const end = String(form.get('endAt') ?? '');
      const created = await api('', 'POST', { name: form.get('name'), eventType: form.get('eventType'), description: form.get('description') || null, timezone, ...(start ? { startAt: localTimeInZone(start, timezone) } : {}), ...(end ? { endAt: localTimeInZone(end, timezone) } : {}) }) as Event;
      await refresh();
      setCreating(false);
      if (created?.id) setExpanded(created.id);
      setMessage('Événement créé. Ajoutez une cérémonie pour pouvoir le publier.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Création impossible.'); }
    finally { setBusy(false); }
  }

  async function addCeremony(eventId: string, form: FormData) {
    setBusy(true); setMessage('');
    try {
      const localStart = String(form.get('startAt'));
      const timezone = String(form.get('timezone'));
      await api(`${eventId}/ceremonies`, 'POST', { name: form.get('name'), ceremonyType: form.get('ceremonyType'), description: form.get('description') || null, location: form.get('location') || null, address: form.get('address') || null, instructions: form.get('instructions') || null, dressCode: form.get('dressCode') || null, notes: form.get('notes') || null, capacity: form.get('capacity') ? Number(form.get('capacity')) : null, latitude: form.get('latitude') ? Number(form.get('latitude')) : null, longitude: form.get('longitude') ? Number(form.get('longitude')) : null, startAt: localTimeInZone(localStart, timezone), ...(form.get('endAt') ? { endAt: localTimeInZone(String(form.get('endAt')), timezone) } : {}), timezone });
      await refresh(); setMessage('Cérémonie ajoutée.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ajout impossible.'); }
    finally { setBusy(false); }
  }

  async function updateEvent(eventId: string, form: FormData) {
    setBusy(true); setMessage('');
    try {
      const timezone = String(form.get('timezone'));
      const start = String(form.get('startAt') ?? '');
      const end = String(form.get('endAt') ?? '');
      await api(eventId, 'PATCH', { name: form.get('name'), eventType: form.get('eventType'), description: form.get('description') || null, timezone, startAt: start ? localTimeInZone(start, timezone) : null, endAt: end ? localTimeInZone(end, timezone) : null });
      await refresh(); setEditingEvent(null); setMessage('Événement mis à jour.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Modification impossible.'); }
    finally { setBusy(false); }
  }

  async function updateCeremony(eventId: string, ceremonyId: string, form: FormData) {
    setBusy(true); setMessage('');
    try {
      const timezone = String(form.get('timezone'));
      const end = String(form.get('endAt') ?? '');
      await api(`${eventId}/ceremonies/${ceremonyId}`, 'PATCH', { name: form.get('name'), ceremonyType: form.get('ceremonyType'), description: form.get('description') || null, location: form.get('location') || null, address: form.get('address') || null, instructions: form.get('instructions') || null, dressCode: form.get('dressCode') || null, notes: form.get('notes') || null, capacity: form.get('capacity') ? Number(form.get('capacity')) : null, latitude: form.get('latitude') ? Number(form.get('latitude')) : null, longitude: form.get('longitude') ? Number(form.get('longitude')) : null, startAt: localTimeInZone(String(form.get('startAt')), timezone), ...(end ? { endAt: localTimeInZone(end, timezone) } : { endAt: null }), timezone });
      await refresh(); setEditingCeremony(null); setMessage('Cérémonie mise à jour.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Modification impossible.'); }
    finally { setBusy(false); }
  }

  async function eventAction(eventId: string, action: 'publish' | 'cancel') {
    setBusy(true); setMessage('');
    try { await api(`${eventId}/${action}`, 'POST', {}); await refresh(); setMessage(action === 'publish' ? 'Événement publié.' : 'Événement annulé.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Action impossible.'); }
    finally { setBusy(false); }
  }

  async function removeCeremony(eventId: string, ceremonyId: string) {
    setBusy(true); setMessage('');
    try { await api(`${eventId}/ceremonies/${ceremonyId}`, 'DELETE'); await refresh(); setMessage('Cérémonie supprimée.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Suppression impossible.'); }
    finally { setBusy(false); }
  }

  function submitCreate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void createEvent(new FormData(event.currentTarget)); }
  function submitCeremony(event: FormEvent<HTMLFormElement>, id: string) { event.preventDefault(); void addCeremony(id, new FormData(event.currentTarget)); }

  return <section className="events-content">
    <div className="events-list-head"><div><p className="eyebrow">VOTRE AGENDA</p><h2>Mes événements <span>{events.length.toString().padStart(2, '0')}</span></h2></div><button className="subtle-link create-toggle" type="button" onClick={() => setCreating((open) => !open)} aria-expanded={creating} aria-controls="create-event">{creating ? 'Fermer' : '+ Nouvel événement'}</button></div>
    <p className="workspace-status" role="status" aria-live="polite">{message}</p>
    {events.length === 0 ? <div className="empty-events"><span className="empty-mark">✳</span><h3>Le premier chapitre commence ici.</h3><p>Créez un événement, puis ajoutez les cérémonies qui composent votre journée.</p></div> : <div className="event-grid">{events.map((event) => <article className="event-card" key={event.id}>
      <div className="event-card-top"><span className={`status-pill ${event.status.toLowerCase()}`}>{statusLabels[event.status] ?? event.status}</span><span className="event-type">{typeLabels[event.eventType] ?? event.eventType}</span>{event.status === 'DRAFT' && <button className="cancel-action" onClick={() => setEditingEvent(editingEvent === event.id ? null : event.id)}>Modifier</button>}</div>
      <h3>{event.name}</h3><p className="event-date">{localDate(event.startAt ?? event.ceremonies[0]?.startAt ?? null, event.timezone)}</p><p className="event-description">{event.description || 'Une belle occasion de se réunir.'}</p><div className="event-workspace-links"><Link className="subtle-link" href={`/events/${event.id}/designs`}>Créer une invitation →</Link><Link className="subtle-link" href={`/events/${event.id}/guests`}>Gérer les invités →</Link><Link className="subtle-link" href={`/events/${event.id}/seating`}>Plan de salle →</Link><Link className="subtle-link" href={`/events/${event.id}`}>Vue événement →</Link></div>
      {editingEvent === event.id && <form className="ceremony-form" onSubmit={(e) => { e.preventDefault(); void updateEvent(event.id, new FormData(e.currentTarget)); }}><strong>Modifier l’événement</strong><input name="name" defaultValue={event.name} minLength={2} maxLength={120} required /><div className="form-pair"><select name="eventType" defaultValue={event.eventType}>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select name="timezone" defaultValue={event.timezone}><option value="Africa/Kinshasa">Kinshasa · CAT</option><option value="Europe/Paris">Paris · CET/CEST</option><option value="UTC">UTC</option></select></div><div className="form-pair"><input name="startAt" type="datetime-local" defaultValue={dateTimeInput(event.startAt, event.timezone)} /><input name="endAt" type="datetime-local" defaultValue={dateTimeInput(event.endAt, event.timezone)} /></div><textarea name="description" defaultValue={event.description ?? ''} maxLength={4000} /><button className="small-action" disabled={busy}>Enregistrer</button></form>}
      <button className="event-expand" onClick={() => setExpanded(expanded === event.id ? null : event.id)}>{expanded === event.id ? 'Masquer le programme' : `Programme · ${event.ceremonies.length} cérémonie${event.ceremonies.length > 1 ? 's' : ''}`} <span>↗</span></button>
      {expanded === event.id && <div className="ceremony-panel">
        <div className="ceremony-list">{event.ceremonies.length === 0 ? <p>Aucune cérémonie pour le moment.</p> : event.ceremonies.map((ceremony) => <div className="ceremony-row" key={ceremony.id}><div><strong>{ceremony.name} <small>{ceremony.ceremonyType}</small></strong><span>{localDate(ceremony.startAt, ceremony.timezone)}{ceremony.location ? ` · ${ceremony.location}` : ''}{ceremony.address ? ` · ${ceremony.address}` : ''}</span>{ceremony.dressCode && <span>Tenue : {ceremony.dressCode}</span>}{ceremony.instructions && <span>{ceremony.instructions}</span>}<CeremonyProgramEditor eventId={event.id} ceremony={ceremony} editable={event.status === 'DRAFT'} onRefresh={refresh} onMessage={setMessage} /></div>{event.status === 'DRAFT' && <><button aria-label={`Modifier ${ceremony.name}`} onClick={() => setEditingCeremony(editingCeremony === ceremony.id ? null : ceremony.id)} disabled={busy}>Modifier</button><button aria-label={`Supprimer ${ceremony.name}`} onClick={() => void removeCeremony(event.id, ceremony.id)} disabled={busy}>×</button></>}</div>)}</div>
        {editingCeremony && event.ceremonies.find((item) => item.id === editingCeremony) && (() => { const item = event.ceremonies.find((entry) => entry.id === editingCeremony)!; return <form className="ceremony-form" onSubmit={(e) => { e.preventDefault(); void updateCeremony(event.id, item.id, new FormData(e.currentTarget)); }}><strong>Modifier {item.name}</strong><input name="name" defaultValue={item.name} minLength={2} maxLength={120} required /><select name="ceremonyType" defaultValue={item.ceremonyType}><option value="CIVIL">Civile</option><option value="RELIGIOUS">Religieuse</option><option value="RECEPTION">Soirée / réception</option><option value="DOT">Dot</option><option value="TRADITIONAL">Traditionnelle</option><option value="OTHER">Autre</option></select><div className="form-pair"><input name="startAt" type="datetime-local" defaultValue={dateTimeInput(item.startAt, item.timezone)} required /><input name="endAt" type="datetime-local" defaultValue={dateTimeInput(item.endAt, item.timezone)} /></div><div className="form-pair"><input name="location" placeholder="Lieu" defaultValue={item.location ?? ''} /><input name="address" placeholder="Adresse" defaultValue={item.address ?? ''} /></div><div className="form-pair"><input name="dressCode" placeholder="Dress code" defaultValue={item.dressCode ?? ''} /><input name="capacity" type="number" min="1" max="100000" placeholder="Capacité" defaultValue={item.capacity ?? ''} /></div><div className="form-pair"><input name="latitude" type="number" step="any" placeholder="Latitude GPS" defaultValue={item.latitude ?? ''} /><input name="longitude" type="number" step="any" placeholder="Longitude GPS" defaultValue={item.longitude ?? ''} /></div><textarea name="description" placeholder="Description" defaultValue={item.description ?? ''} /><textarea name="instructions" placeholder="Instructions" defaultValue={item.instructions ?? ''} /><textarea name="notes" placeholder="Notes" defaultValue={item.notes ?? ''} /><select name="timezone" defaultValue={item.timezone}><option value="Africa/Kinshasa">Kinshasa · CAT</option><option value="Europe/Paris">Paris · CET/CEST</option><option value="UTC">UTC</option></select><button className="small-action" disabled={busy}>Enregistrer la cérémonie</button></form>; })()}
        {event.status === 'DRAFT' && <form className="ceremony-form" onSubmit={(e) => submitCeremony(e, event.id)}><strong>Ajouter une cérémonie</strong><div className="form-pair"><input name="name" placeholder="Nom (ex. cérémonie civile)" minLength={2} maxLength={120} required /><select name="ceremonyType" defaultValue="CIVIL"><option value="CIVIL">Civile</option><option value="RELIGIOUS">Religieuse</option><option value="RECEPTION">Soirée / réception</option><option value="DOT">Dot</option><option value="TRADITIONAL">Traditionnelle</option><option value="OTHER">Autre</option></select></div><div className="form-pair"><input name="startAt" type="datetime-local" required /><input name="endAt" type="datetime-local" /><input name="location" placeholder="Lieu (optionnel)" maxLength={300} /></div><div className="form-pair"><input name="address" placeholder="Adresse (optionnel)" maxLength={500} /><input name="dressCode" placeholder="Dress code (facultatif)" maxLength={200} /></div><div className="form-pair"><input name="capacity" type="number" min="1" max="100000" placeholder="Capacité (optionnelle)" /><select name="timezone" defaultValue={event.timezone}><option value="Africa/Kinshasa">Kinshasa · CAT</option><option value="Europe/Paris">Paris · CET/CEST</option><option value="UTC">UTC</option></select></div><div className="form-pair"><input name="latitude" type="number" step="any" placeholder="Latitude GPS" /><input name="longitude" type="number" step="any" placeholder="Longitude GPS" /></div><textarea name="description" placeholder="Description (facultatif)" maxLength={2000} /><textarea name="instructions" placeholder="Instructions (facultatif)" maxLength={4000} /><textarea name="notes" placeholder="Notes (facultatif)" maxLength={2000} /><button className="small-action" disabled={busy}>Ajouter au programme</button></form>}
        <div className="event-actions">{event.status === 'DRAFT' && <button className="publish-action" onClick={() => void eventAction(event.id, 'publish')} disabled={busy || event.ceremonies.length === 0}>Publier l’événement</button>}{event.status !== 'CANCELLED' && event.status !== 'COMPLETED' && <button className="cancel-action" onClick={() => void eventAction(event.id, 'cancel')} disabled={busy}>Annuler</button>}</div>
      </div>}
    </article>)}</div>}
    <div id="create-event" className={`create-event${creating ? ' is-open' : ''}`} hidden={!creating}><div><p className="eyebrow">ÉTAPE 1 · LES ESSENTIELS</p><h2>Créer un événement</h2><p>Choisissez le type, donnez-lui un nom et fixez sa date. Le lieu et la capacité se configurent ensuite par cérémonie.</p></div><form onSubmit={submitCreate}><label>Type d’événement<select name="eventType" defaultValue="WEDDING">{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Nom de l’événement<input name="name" placeholder="Ex. Mariage de Nadia & Samuel" minLength={2} maxLength={120} required /></label><div className="form-pair"><label>Date et heure de début<input name="startAt" type="datetime-local" /></label><label>Fuseau horaire<select name="timezone" defaultValue="Africa/Kinshasa"><option value="Africa/Kinshasa">Kinshasa · CAT</option><option value="Europe/Paris">Paris · CET/CEST</option><option value="UTC">UTC</option></select></label></div><details className="create-advanced"><summary>Ajouter une description</summary><label>Description<textarea name="description" maxLength={4000} placeholder="Quelques mots sur votre événement…" /></label></details><p className="create-note">Le lieu et la capacité sont enregistrés sur chaque cérémonie. Le nombre d’invités affiché ensuite viendra de votre liste réelle.</p><button className="create-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Créer et continuer'} <span>→</span></button></form></div>
  </section>;
}
