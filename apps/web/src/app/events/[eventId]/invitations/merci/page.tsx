import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import AppNavbar from '@/components/AppNavbar';
import EventJourney from '@/components/event-journey';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { InvitationConfirmation } from './confirmation';
import '../../../events.css';
import '../../../journey.css';
import '../invitations.css';
import '../invitations-journey.css';

export const dynamic = 'force-dynamic';
export default async function ThankYouPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ batch?: string }> }) {
  const { eventId } = await params;
  const { batch } = await searchParams;
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  const returnTo = `/events/${encodeURIComponent(eventId)}/invitations/merci${batch ? `?batch=${encodeURIComponent(batch)}` : ''}`;
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events/${encodeURIComponent(eventId)}`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (response.status === 401) redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
    if (response.status === 404 || response.status === 403) notFound();
    if (!response.ok) throw new Error('event_unavailable');
    const event = await response.json() as { id: string; name: string; eventType?: string; status: string; ceremonies: unknown[] };
    if (event.id !== eventId || !Array.isArray(event.ceremonies)) throw new Error('invalid_event');
    return <main className="events-shell"><AppNavbar eventId={eventId} /><EventJourney eventId={eventId} activeStep="thanks" ceremonyCount={event.ceremonies.length} eventType={event.eventType} eventStatus={event.status} /><InvitationConfirmation eventId={eventId} eventName={event.name} batchId={batch} /></main>;
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    return <main className="events-shell"><AppNavbar eventId={eventId} /><section className="invitation-panel"><h1>Confirmation momentanément indisponible</h1><p>Vos données enregistrées sont conservées. Réessayez ou consultez vos lots.</p><a href={returnTo}>Réessayer</a> · <a href={`/events/${encodeURIComponent(eventId)}/invitations`}>Retrouver mes lots</a></section></main>;
  }
}
