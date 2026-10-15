'use client';

import { useEffect, useState } from 'react';

export function NotificationBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch('/api/notifications?limit=1&unread=true', { cache: 'no-store' });
        const payload: unknown = await response.json();
        const unreadCount = payload && typeof payload === 'object' ? (payload as Record<string, unknown>)['unreadCount'] : null;
        if (!cancelled && response.ok && typeof unreadCount === 'number' && Number.isSafeInteger(unreadCount)) setCount(Math.max(0, unreadCount));
      } catch { /* The navigation stays usable when notifications are unavailable. */ }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    const update = () => void refresh();
    window.addEventListener('invitaflow:notifications-updated', update);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('invitaflow:notifications-updated', update); };
  }, []);
  if (!count) return null;
  return <span className="notification-badge" aria-label={`${count > 99 ? 'Plus de 99' : count} notification${count === 1 ? '' : 's'} non lue${count === 1 ? '' : 's'}`}>{count > 99 ? '99+' : count}</span>;
}
