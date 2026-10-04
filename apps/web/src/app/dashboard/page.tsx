import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import AppNavbar from '@/components/AppNavbar';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import type { Event } from '@/app/events/types';
import './dashboard.css';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) redirect('/api/auth/login?returnTo=%2Fdashboard');

  let events: Event[] = [];
  let unavailable = false;
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events?limit=50`, {
      headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 401) redirect('/api/auth/login?returnTo=%2Fdashboard');
    if (!response.ok) unavailable = true;
    else {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)) events = (payload as { items: Event[] }).items;
      else unavailable = true;
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_')) throw error;
    unavailable = true;
  }

  const upcoming = events.find((event) => event.status !== 'CANCELLED' && event.status !== 'COMPLETED');
  const greeting = session.user?.name?.trim().split(/\s+/)[0];
  return <main className="events-shell dashboard-shell">
    <AppNavbar />
    <header className="dashboard-welcome"><p className="eyebrow">VOTRE ESPACE</p><h1>Bonjour{greeting ? `, ${greeting}` : ''}<br /><em>que célébrons-nous ?</em></h1><p>Retrouvez vos événements et continuez leur préparation.</p><Link className="dashboard-primary" href="/events#create-event">Créer un événement <span>→</span></Link></header>
    {unavailable ? <section className="events-notice"><h2>Votre espace est momentanément indisponible</h2><p>Le service des événements n’a pas répondu. Réessayez dans un instant.</p><Link href="/dashboard">Réessayer</Link></section> : <>
      {upcoming && <section className="dashboard-next"><div><p className="eyebrow">À PRÉPARER</p><h2>{upcoming.name}</h2><p>{upcoming.ceremonies.length} cérémonie{upcoming.ceremonies.length === 1 ? '' : 's'} configurée{upcoming.ceremonies.length === 1 ? '' : 's'}</p></div><Link href={`/events/${encodeURIComponent(upcoming.id)}`}>Continuer la préparation <span>→</span></Link></section>}
      <section className="dashboard-events"><div className="events-list-head"><div><p className="eyebrow">VOTRE AGENDA</p><h2>Événements récents</h2></div><Link className="subtle-link" href="/events">Voir tous les événements →</Link></div>
        {events.length === 0 ? <div className="empty-events"><span className="empty-mark">✳</span><h3>Le premier chapitre commence ici.</h3><p>Créez un événement pour commencer à préparer votre journée.</p><Link className="dashboard-primary" href="/events#create-event">Créer mon premier événement →</Link></div> : <div className="dashboard-event-list">{events.slice(0, 3).map((event) => <Link className="dashboard-event-row" key={event.id} href={`/events/${encodeURIComponent(event.id)}`}><span className="dashboard-event-mark" aria-hidden="true">✳</span><span><strong>{event.name}</strong><small>{event.eventType} · {event.status}</small></span><span aria-hidden="true">→</span></Link>)}</div>}
      </section>
    </>}
  </main>;
}
