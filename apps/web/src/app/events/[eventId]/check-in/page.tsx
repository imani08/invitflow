import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import AppNavbar from '@/components/AppNavbar';
import EventJourney from '@/components/event-journey';
import { CheckInLinkManager } from './checkin-link-manager';
import './check-in.css';
import '../../journey.css';
import './check-in-journey.css';

export const dynamic = 'force-dynamic';
export default async function CheckInPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params; const store = await cookies(); const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/check-in`)}`);
  try {
    const gateway = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';
    const response = await fetch(`${gateway}/v1/events/${encodeURIComponent(eventId)}`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (response.status === 401) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/check-in`)}`);
    if (!response.ok) throw new Error('event_unavailable');
    const event = await response.json() as { id: string; name: string; eventType?: string; status?: string; ceremonies: { id: string; name: string; startAt?: string }[] };
    return <main className="check-shell"><AppNavbar eventId={eventId} /><EventJourney eventId={eventId} activeStep="checkin" ceremonyCount={event.ceremonies?.length ?? 0} eventType={event.eventType} {...(event.status ? { eventStatus: event.status } : {})} /><header><p>POINTAGE PARTAGEABLE</p><h1>{event.name}</h1><span>Créez un lien sécurisé à utiliser simultanément sur les téléphones de l’accueil.</span></header><CheckInLinkManager eventId={eventId} ceremonies={event.ceremonies ?? []} /></main>;
  } catch (error) { if (error && typeof error === 'object' && 'digest' in error) throw error; return <main className="check-shell"><AppNavbar eventId={eventId} /><h1>Pointage indisponible</h1><p>Réessayez lorsque les services seront accessibles.</p></main>; }
}
