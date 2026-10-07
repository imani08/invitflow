'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/date-format.mjs';

type Notification = { id: string; category: string; title: string; message: string; createdAt: string; readAt: string | null; data: Record<string, string> };
type Inbox = { items: Notification[]; unreadCount: number; nextCursor: string | null };

export function NotificationInbox({ initial, initialEnabled }: { initial: Inbox; initialEnabled: boolean }) {
  const [items, setItems] = useState(initial.items);
  const [unread, setUnread] = useState(initial.unreadCount);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function setPreference(value: boolean) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/notifications/preferences', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ enabled: value }) });
      if (!response.ok) throw new Error();
      setEnabled(value); setMessage(value ? 'Notifications activées.' : 'Notifications désactivées.');
    } catch { setMessage('La préférence n’a pas pu être enregistrée.'); }
    finally { setBusy(false); }
  }

  async function markRead(id: string) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' });
      if (!response.ok) throw new Error();
      setItems((current) => current.map((item) => item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item));
      setUnread((current) => Math.max(0, current - (items.find((item) => item.id === id && !item.readAt) ? 1 : 0)));
    } catch { setMessage('La notification n’a pas pu être mise à jour.'); }
    finally { setBusy(false); }
  }

  async function markAllRead() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!response.ok) throw new Error();
      const readAt = new Date().toISOString(); setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt })); setUnread(0);
    } catch { setMessage('Les notifications n’ont pas pu être mises à jour.'); }
    finally { setBusy(false); }
  }

  async function loadMore() {
    if (!cursor) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/notifications?limit=50&cursor=${encodeURIComponent(cursor)}`);
      if (!response.ok) throw new Error();
      const next = await response.json() as Inbox;
      if (!Array.isArray(next.items) || !Number.isSafeInteger(next.unreadCount)) throw new Error();
      setItems((current) => [...current, ...next.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setCursor(next.nextCursor); setUnread(next.unreadCount);
    } catch { setMessage('Les notifications suivantes n’ont pas pu être chargées.'); }
    finally { setBusy(false); }
  }

  return <section className="notification-panel">
    <div className="notification-controls"><span>{unread} non lue{unread === 1 ? '' : 's'}</span><button type="button" disabled={busy || unread === 0} onClick={() => void markAllRead()}>Tout marquer comme lu</button></div>
    <div className="notification-preference"><div><strong>Notifications dans l’application</strong><small>Confirmations de paiement, événements et imports d’invités</small></div><button type="button" role="switch" aria-checked={enabled} disabled={busy} onClick={() => void setPreference(!enabled)}>{enabled ? 'Activées' : 'Désactivées'}</button></div>
    {message && <p className="notification-status" role="status">{message}</p>}
    {items.length ? <><div className="notification-list">{items.map((item) => <article key={item.id} className={item.readAt ? 'notification-item is-read' : 'notification-item'}><div className="notification-copy"><span className="notification-category">{item.category === 'billing' ? 'PORTEFEUILLE' : item.category === 'guests' ? 'INVITÉS' : 'ÉVÉNEMENT'}</span><h2>{item.title}</h2><p>{item.message}</p><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time></div>{!item.readAt && <button className="notification-read" type="button" disabled={busy} onClick={() => void markRead(item.id)}>Marquer comme lue</button>}</article>)}</div>{cursor && <button className="notification-load-more" type="button" disabled={busy} onClick={() => void loadMore()}>{busy ? 'Chargement…' : 'Charger les notifications précédentes'}</button>}</> : <div className="notification-empty">Aucune notification pour le moment.</div>}
  </section>;
}
