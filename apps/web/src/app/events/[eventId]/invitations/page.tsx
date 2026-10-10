import AppNavbar from '@/components/AppNavbar';
import EventJourney from '@/components/event-journey';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { InvitationsWorkspace } from './workspace';
import './invitations.css';
import '../../journey.css';
import './invitations-journey.css';

export const dynamic = 'force-dynamic';
export default async function InvitationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params; const store = await cookies(); const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/invitations`)}`);
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events/${encodeURIComponent(eventId)}`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (response.status === 401) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/invitations`)}`);
    if (response.status === 404) notFound(); if (!response.ok) throw new Error('event_unavailable');
    const event = await response.json() as { id: string; name: string; status?: string; ceremonies?: { id: string }[] }; return <main className="events-shell"><AppNavbar eventId={eventId} /><header className="invitation-heading"><a href={`/events/${eventId}/designs`}>← Retour aux designs</a><p className="eyebrow">INVITATION &amp; RENDU</p><h1>{event.name}</h1><p>Vérifiez les prérequis, prévisualisez, puis lancez la génération finale.</p></header><EventJourney eventId={eventId} activeStep="invitations" ceremonyCount={event.ceremonies?.length ?? 0} eventStatus={event.status ?? ''} /><InvitationsWorkspace eventId={eventId} eventName={event.name} /></main>;
  } catch (error) { if (error && typeof error === 'object' && 'digest' in error) throw error; return <main className="events-shell"><AppNavbar eventId={eventId} /><section className="invitation-panel"><h1>Événement indisponible</h1><p>Réessayez lorsque les services seront accessibles.</p></section></main>; }
}
