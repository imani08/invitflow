import AppNavbar from '@/components/AppNavbar';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { SeatingWorkspace } from './workspace';
import './seating.css';
import '../../journey.css';
import './seating-journey.css';

type Ceremony = { id: string; name: string; ceremonyType: string; startAt: string; timezone: string; status: string };
type Event = { id: string; name: string; status: string; timezone: string; ceremonies: Ceremony[] };

export const dynamic = 'force-dynamic';

export default async function SeatingPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const returnTo = `/events/${eventId}/seating`;
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  let event: Event;
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events/${encodeURIComponent(eventId)}`, {
      headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 401) redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
    if (response.status === 404) notFound();
    if (!response.ok) throw new Error('Events service unavailable');
    event = await response.json() as Event;
    if (event.id !== eventId || !Array.isArray(event.ceremonies)) notFound();
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    return <main className="events-shell seating-page"><AppNavbar eventId={eventId} /><section className="events-notice"><h1>Plan de salle indisponible</h1><p>Le service Événements est momentanément inaccessible.</p><a href={returnTo}>Réessayer</a></section></main>;
  }
  return <main className="events-shell seating-page"><AppNavbar eventId={eventId} />
    <header className="seating-heading"><Link href="/events">← Retour aux événements</Link><p className="eyebrow">PLACEMENT & CAPACITÉS</p><h1>{event.name}</h1><p>Préparez un plan de salle distinct pour chaque cérémonie.</p><a className="seating-guest-link" href={`/events/${event.id}/designs`}>Créer une invitation →</a><a className="seating-guest-link" href={`/events/${event.id}/guests`}>Gérer les invités →</a></header>
    <SeatingWorkspace event={event} />
  </main>;
}
