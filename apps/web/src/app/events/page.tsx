import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import AppNavbar from '@/components/AppNavbar';
import { EventsWorkspace } from './workspace';
import type { Event } from './types';
import './events.css';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Fevents');
  let initialEvents: Event[] = [];
  let unavailable = false;
  let unauthorized = false;
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events?limit=50`, {
      headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 401) unauthorized = true;
    else if (!response.ok) unavailable = true;
    else {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) initialEvents = (payload as { items: Event[] }).items;
      else unavailable = true;
    }
  } catch { unavailable = true; }
  if (unauthorized) redirect('/api/auth/login?returnTo=%2Fevents');

  return <main className="events-shell">
    <AppNavbar />
    <header className="events-heading"><p className="eyebrow">ESPACE ÉVÉNEMENTS</p><h1>Vos événements,<br /><em>vos moments.</em></h1><p>Organisez mariages, anniversaires, conférences et rencontres au même endroit.</p></header>
    {unavailable ? <section className="events-notice"><h2>Les événements sont momentanément indisponibles</h2><p>La plateforme n’a pas pu joindre son service. Vérifiez que les dépendances et la base sont démarrées, puis réessayez.</p><Link href="/events">Réessayer</Link></section> : <EventsWorkspace initialEvents={initialEvents} />}
  </main>;
}
