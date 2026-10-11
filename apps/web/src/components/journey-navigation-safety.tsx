'use client';
import { useEffect } from 'react';

/** Warn before leaving unsaved inputs; never persist guest information in browser storage. */
export function JourneyNavigationSafety({ dirty = false, watchForms = false }: { dirty?: boolean; watchForms?: boolean }) {
  useEffect(() => {
    const changed = new Set<HTMLFormElement>();
    const hasChanges = () => dirty || [...changed].some(form => form.isConnected);
    const input = (event: Event) => { const target = event.target; if (watchForms && target instanceof HTMLElement) { const form = target.closest('form'); if (form) changed.add(form); } };
    const reset = (event: Event) => { if (event.target instanceof HTMLFormElement) changed.delete(event.target); };
    const leave = (event: BeforeUnloadEvent) => { if (hasChanges()) { event.preventDefault(); event.returnValue = ''; } };
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || !hasChanges() || link.getAttribute('target') === '_blank' || link.hasAttribute('download')) return;
      const destination = new URL(link.getAttribute('href')!, location.href);
      if (destination.origin === location.origin && (destination.pathname.startsWith('/api/') || destination.pathname === location.pathname && destination.search === location.search)) return;
      if (!window.confirm('Des modifications ne sont peut-être pas enregistrées. Restez sur cette page pour les enregistrer. Quitter quand même ?')) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    document.addEventListener('input', input); document.addEventListener('reset', reset);
    document.addEventListener('click', click, true); window.addEventListener('beforeunload', leave);
    return () => { document.removeEventListener('input', input); document.removeEventListener('reset', reset); document.removeEventListener('click', click, true); window.removeEventListener('beforeunload', leave); };
  }, [dirty, watchForms]);
  return null;
}
