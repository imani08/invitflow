import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import AppNavbar from '@/components/AppNavbar';
import EventJourney from '@/components/event-journey';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import '../events.css';
import '../journey.css';
import './event-overview.css';

export const dynamic = 'force-dynamic';

type EventOverview = {
  id: string;
  name: string;
  status: string;
  ceremonies?: { id: string; name: string; ceremonyType: string }[];
};

export default async function EventOverviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const eventStatusLabels: Record<string, string> = { DRAFT: 'Brouillon', PUBLISHED: 'Publié', CANCELLED: 'Annulé', COMPLETED: 'Terminé' };
  const returnTo = encodeURIComponent(`/events/${eventId}`);
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${returnTo}`);

  let event: EventOverview;
  try {
    const response = await fetch(
      `${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events/${encodeURIComponent(eventId)}`,
      {
        headers: { authorization: `Bearer ${session.accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (response.status === 401) redirect(`/api/auth/login?returnTo=${returnTo}`);
    if (response.status === 404) notFound();
    if (!response.ok) throw new Error('event_unavailable');
    event = (await response.json()) as EventOverview;
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_')) throw error;
    return (
      <main className="events-shell">
        <AppNavbar eventId={eventId} />
        <section className="events-notice">
          <h1>Événement momentanément indisponible</h1>
          <p>Vérifiez la connexion aux services puis réessayez.</p>
          <Link href={`/events/${encodeURIComponent(eventId)}`}>Réessayer</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="events-shell">
      <AppNavbar eventId={eventId} />
      <header className="events-heading">
        <p className="eyebrow">APERÇU DE L’ÉVÉNEMENT · {eventStatusLabels[event.status] ?? 'Statut à vérifier'}</p>
        <h1>{event.name}</h1>
        <p>Votre événement est enregistré. Configurez les cérémonies, puis poursuivez à votre rythme.</p>
      </header>
      <EventJourney eventId={eventId} activeStep="ceremonies" ceremonyCount={event.ceremonies?.length ?? 0} eventStatus={event.status} />
    </main>
  );
}
