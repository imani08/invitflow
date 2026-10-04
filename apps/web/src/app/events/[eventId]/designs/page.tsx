import AppNavbar from '@/components/AppNavbar';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { DesignsWorkspace } from './workspace';
import './designs.css';
import './designs-step1.css';
import '../../journey.css';
import './designs-journey.css';

type Event = { id: string; name: string; status: string; timezone: string; ceremonies: { id: string; name: string; ceremonyType: string }[] };

export const dynamic = 'force-dynamic';

export default async function DesignsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const cookiesStore = await cookies();
  const session = await getSession(cookiesStore.get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/designs`)}`);
  let event: Event;
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events/${encodeURIComponent(eventId)}`, {
      headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 401) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/designs`)}`);
    if (response.status === 404) notFound();
    if (!response.ok) throw new Error('event_unavailable');
    event = await response.json() as Event;
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_')) throw error;
    return <main className="events-shell design-page"><AppNavbar eventId={eventId} /><section className="design-unavailable"><span>ESPACE CRÉATION</span><h1>Le design n’a pas pu être chargé.</h1><p>Vérifiez la connexion aux services puis réessayez.</p><a href={`/events/${encodeURIComponent(eventId)}/designs`}>Réessayer</a></section></main>;
  }
  return <DesignsWorkspace event={event} />;
}
