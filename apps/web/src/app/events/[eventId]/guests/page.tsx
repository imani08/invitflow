import AppNavbar from '@/components/AppNavbar';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { GuestsWorkspace } from './workspace';
import './guests.css';

type Ceremony = { id: string; name: string; ceremonyType: string; startAt: string; timezone: string; status: string };
type Event = { id: string; name: string; status: string; timezone: string; ceremonies: Ceremony[] };

export const dynamic = 'force-dynamic';

export default async function GuestsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const cookieStore = await cookies();
  const session = await getSession(cookieStore.get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/guests`)}`);
  let event: Event;
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events/${encodeURIComponent(eventId)}`, {
      headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 401) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/guests`)}`);
    if (response.status === 404) notFound();
    if (!response.ok) throw new Error('Event service unavailable');
    event = await response.json() as Event;
    if (event.id !== eventId || !Array.isArray(event.ceremonies)) notFound();
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    return <main className="events-shell"><AppNavbar eventId={eventId} /><section className="events-notice"><h1>Liste d’invités indisponible</h1><p>Le service Événements est momentanément inaccessible.</p><a href={`/events/${eventId}/guests`}>Réessayer</a></section></main>;
  }
  return <main className="events-shell"><AppNavbar eventId={eventId} />
    <header className="guests-heading"><Link href="/events">← Retour aux événements</Link><p className="eyebrow">GESTION DES INVITÉS</p><h1>{event.name}</h1><p>Préparez votre liste et choisissez les cérémonies accessibles à chaque invité.</p><a href={`/events/${event.id}/designs`}>Créer un design →</a> <a href={`/events/${event.id}/invitations`}>Générer les invitations →</a> <a href={`/events/${event.id}/seating`}>Ouvrir le plan de salle →</a></header>
    <GuestsWorkspace event={event} />
  </main>;
}
