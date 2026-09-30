'use client';

import { useState, type FormEvent } from 'react';
import type { Ceremony, Event } from './types';

const typeLabels: Record<string, string> = { WEDDING: 'Mariage', BIRTHDAY: 'Anniversaire', GRADUATION: 'Graduation', BAPTISM: 'Baptême', BABY_SHOWER: 'Baby shower', CONFERENCE: 'Conférence', GALA: 'Gala', DINNER: 'Dîner', CORPORATE: 'Événement professionnel', CEREMONY: 'Cérémonie', RELIGIOUS: 'Cérémonie religieuse', ANNIVERSARY: 'Anniversaire de mariage', OTHER: 'Autre' };
const statusLabels: Record<string, string> = { DRAFT: 'Brouillon', PUBLISHED: 'Publié', CANCELLED: 'Annulé', COMPLETED: 'Terminé' };

async function api(path: string, method = 'GET', data?: Record<string, unknown>) {
  const response = await fetch(`/api/events/${path}`, { method, ...(data !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const result: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result && typeof result === 'object' && 'message' in result && typeof result.message === 'string' ? result.message : 'Une erreur est survenue.');
  return result;
}

function localDate(value: string | null, timeZone = 'Africa/Kinshasa') {
  return value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value)) : 'Date à préciser';
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

export function EventsWorkspace({ initialEvents }: { initialEvents: Event[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<string | null>(null);
  const [editingCeremony, setEditingCeremony] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

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
      await api('', 'POST', { name: form.get('name'), eventType: form.get('eventType'), description: form.get('description') || null, timezone, ...(start ? { startAt: localTimeInZone(start, timezone) } : {}), ...(end ? { endAt: localTimeInZone(end, timezone) } : {}) });
      await refresh();
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
    <div className="events-list-head"><div><p className="eyebrow">VOTRE AGENDA</p><h2>Mes événements <span>{events.length.toString().padStart(2, '0')}</span></h2></div><a className="subtle-link" href="#create-event">+ Nouvel événement</a></div>
    <p className="workspace-status" role="status" aria-live="polite">{message}</p>
    {events.length === 0 ? <div className="empty-events"><span className="empty-mark">✳</span><h3>Le premier chapitre commence ici.</h3><p>Créez un événement, puis ajoutez les cérémonies qui composent votre journée.</p></div> : <div className="event-grid">{events.map((event) => <article className="event-card" key={event.id}>
      <div className="event-card-top"><span className={`status-pill ${event.status.toLowerCase()}`}>{statusLabels[event.status] ?? event.status}</span><span className="event-type">{typeLabels[event.eventType] ?? event.eventType}</span>{event.status === 'DRAFT' && <button className="cancel-action" onClick={() => setEditingEvent(editingEvent === event.id ? null : event.id)}>Modifier</button>}</div>
      <h3>{event.name}</h3><p className="event-date">{localDate(event.startAt ?? event.ceremonies[0]?.startAt ?? null, event.timezone)}</p><p className="event-description">{event.description || 'Une belle occasion de se réunir.'}</p><div className="event-workspace-links"><a className="subtle-link" href={`/events/${event.id}/designs`}>Créer une invitation →</a><a className="subtle-link" href={`/events/${event.id}/guests`}>Gérer les invités →</a><a className="subtle-link" href={`/events/${event.id}/seating`}>Plan de salle →</a></div>
      {editingEvent === event.id && <form className="ceremony-form" onSubmit={(e) => { e.preventDefault(); void updateEvent(event.id, new FormData(e.currentTarget)); }}><strong>Modifier l’événement</strong><input name="name" defaultValue={event.name} minLength={2} maxLength={120} required /><div className="form-pair"><select name="eventType" defaultValue={event.eventType}>{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select name="timezone" defaultValue={event.timezone}><option value="Africa/Kinshasa">Kinshasa · CAT</option><option value="Europe/Paris">Paris · CET/CEST</option><option value="UTC">UTC</option></select></div><div className="form-pair"><input name="startAt" type="datetime-local" defaultValue={dateTimeInput(event.startAt, event.timezone)} /><input name="endAt" type="datetime-local" defaultValue={dateTimeInput(event.endAt, event.timezone)} /></div><textarea name="description" defaultValue={event.description ?? ''} maxLength={4000} /><button className="small-action" disabled={busy}>Enregistrer</button></form>}
      <button className="event-expand" onClick={() => setExpanded(expanded === event.id ? null : event.id)}>{expanded === event.id ? 'Masquer le programme' : `Programme · ${event.ceremonies.length} cérémonie${event.ceremonies.length > 1 ? 's' : ''}`} <span>↗</span></button>
      {expanded === event.id && <div className="ceremony-panel">
        <div className="ceremony-list">{event.ceremonies.length === 0 ? <p>Aucune cérémonie pour le moment.</p> : event.ceremonies.map((ceremony) => <div className="ceremony-row" key={ceremony.id}><div><strong>{ceremony.name} <small>{ceremony.ceremonyType}</small></strong><span>{localDate(ceremony.startAt, ceremony.timezone)}{ceremony.location ? ` · ${ceremony.location}` : ''}{ceremony.address ? ` · ${ceremony.address}` : ''}</span>{ceremony.dressCode && <span>Tenue : {ceremony.dressCode}</span>}{ceremony.instructions && <span>{ceremony.instructions}</span>}</div>{event.status === 'DRAFT' && <><button aria-label={`Modifier ${ceremony.name}`} onClick={() => setEditingCeremony(editingCeremony === ceremony.id ? null : ceremony.id)} disabled={busy}>Modifier</button><button aria-label={`Supprimer ${ceremony.name}`} onClick={() => void removeCeremony(event.id, ceremony.id)} disabled={busy}>×</button></>}</div>)}</div>
        {editingCeremony && event.ceremonies.find((item) => item.id === editingCeremony) && (() => { const item = event.ceremonies.find((entry) => entry.id === editingCeremony)!; return <form className="ceremony-form" onSubmit={(e) => { e.preventDefault(); void updateCeremony(event.id, item.id, new FormData(e.currentTarget)); }}><strong>Modifier {item.name}</strong><input name="name" defaultValue={item.name} minLength={2} maxLength={120} required /><select name="ceremonyType" defaultValue={item.ceremonyType}><option value="CIVIL">Civile</option><option value="RELIGIOUS">Religieuse</option><option value="RECEPTION">Soirée / réception</option><option value="DOT">Dot</option><option value="TRADITIONAL">Traditionnelle</option><option value="OTHER">Autre</option></select><div className="form-pair"><input name="startAt" type="datetime-local" defaultValue={dateTimeInput(item.startAt, item.timezone)} required /><input name="endAt" type="datetime-local" defaultValue={dateTimeInput(item.endAt, item.timezone)} /></div><div className="form-pair"><input name="location" placeholder="Lieu" defaultValue={item.location ?? ''} /><input name="address" placeholder="Adresse" defaultValue={item.address ?? ''} /></div><div className="form-pair"><input name="dressCode" placeholder="Dress code" defaultValue={item.dressCode ?? ''} /><input name="capacity" type="number" min="1" max="100000" placeholder="Capacité" defaultValue={item.capacity ?? ''} /></div><div className="form-pair"><input name="latitude" type="number" step="any" placeholder="Latitude GPS" defaultValue={item.latitude ?? ''} /><input name="longitude" type="number" step="any" placeholder="Longitude GPS" defaultValue={item.longitude ?? ''} /></div><textarea name="description" placeholder="Description" defaultValue={item.description ?? ''} /><textarea name="instructions" placeholder="Instructions" defaultValue={item.instructions ?? ''} /><textarea name="notes" placeholder="Notes" defaultValue={item.notes ?? ''} /><select name="timezone" defaultValue={item.timezone}><option value="Africa/Kinshasa">Kinshasa · CAT</option><option value="Europe/Paris">Paris · CET/CEST</option><option value="UTC">UTC</option></select><button className="small-action" disabled={busy}>Enregistrer la cérémonie</button></form>; })()}
        {event.status === 'DRAFT' && <form className="ceremony-form" onSubmit={(e) => submitCeremony(e, event.id)}><strong>Ajouter une cérémonie</strong><div className="form-pair"><input name="name" placeholder="Nom (ex. cérémonie civile)" minLength={2} maxLength={120} required /><select name="ceremonyType" defaultValue="CIVIL"><option value="CIVIL">Civile</option><option value="RELIGIOUS">Religieuse</option><option value="RECEPTION">Soirée / réception</option><option value="DOT">Dot</option><option value="TRADITIONAL">Traditionnelle</option><option value="OTHER">Autre</option></select></div><div className="form-pair"><input name="startAt" type="datetime-local" required /><input name="endAt" type="datetime-local" /><input name="location" placeholder="Lieu (optionnel)" maxLength={300} /></div><div className="form-pair"><input name="address" placeholder="Adresse (optionnel)" maxLength={500} /><input name="dressCode" placeholder="Dress code (facultatif)" maxLength={200} /></div><div className="form-pair"><input name="capacity" type="number" min="1" max="100000" placeholder="Capacité (optionnelle)" /><select name="timezone" defaultValue={event.timezone}><option value="Africa/Kinshasa">Kinshasa · CAT</option><option value="Europe/Paris">Paris · CET/CEST</option><option value="UTC">UTC</option></select></div><div className="form-pair"><input name="latitude" type="number" step="any" placeholder="Latitude GPS" /><input name="longitude" type="number" step="any" placeholder="Longitude GPS" /></div><textarea name="description" placeholder="Description (facultatif)" maxLength={2000} /><textarea name="instructions" placeholder="Instructions (facultatif)" maxLength={4000} /><textarea name="notes" placeholder="Notes (facultatif)" maxLength={2000} /><button className="small-action" disabled={busy}>Ajouter au programme</button></form>}
        <div className="event-actions">{event.status === 'DRAFT' && <button className="publish-action" onClick={() => void eventAction(event.id, 'publish')} disabled={busy || event.ceremonies.length === 0}>Publier l’événement</button>}{event.status !== 'CANCELLED' && event.status !== 'COMPLETED' && <button className="cancel-action" onClick={() => void eventAction(event.id, 'cancel')} disabled={busy}>Annuler</button>}</div>
      </div>}
    </article>)}</div>}
    <div id="create-event" className="create-event"><div><p className="eyebrow">COMMENCER</p><h2>Créer un événement</h2><p>Un événement publié ne peut plus être modifié, mais peut être annulé.</p></div><form onSubmit={submitCreate}><label>Nom de l’événement<input name="name" placeholder="Ex. Mariage de Nadia & Samuel" minLength={2} maxLength={120} required /></label><div className="form-pair"><label>Type<select name="eventType" defaultValue="WEDDING">{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Fuseau horaire<select name="timezone" defaultValue="Africa/Kinshasa"><option value="Africa/Kinshasa">Kinshasa · CAT</option><option value="Europe/Paris">Paris · CET/CEST</option><option value="UTC">UTC</option></select></label></div><div className="form-pair"><label>Date de début (facultative)<input name="startAt" type="datetime-local" /></label><label>Date de fin (facultative)<input name="endAt" type="datetime-local" /></label></div><label>Description (facultatif)<textarea name="description" maxLength={4000} placeholder="Quelques mots sur votre événement…" /></label><button className="create-button" disabled={busy}>{busy ? 'Enregistrement…' : 'Créer mon événement'} <span>→</span></button></form></div>
  </section>;
}
