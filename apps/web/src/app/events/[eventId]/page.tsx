import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import AppNavbar from '@/components/AppNavbar';
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

  const steps = [
    ['Cérémonies', 'Configurez les horaires et lieux'],
    ['Invités', 'Ajoutez ou importez votre liste'],
    ['Placement', 'Organisez les tables et les zones'],
    ['Design', 'Choisissez puis personnalisez un modèle'],
    ['Invitations', 'Prévisualisez et générez les invitations'],
    ['Check-in', 'Accueillez vos invités avec leur QR privé'],
  ] as const;
  const urls = [
    `/events?event=${encodeURIComponent(eventId)}`,
    `/events/${encodeURIComponent(eventId)}/guests`,
    `/events/${encodeURIComponent(eventId)}/seating`,
    `/events/${encodeURIComponent(eventId)}/designs`,
    `/events/${encodeURIComponent(eventId)}/invitations`,
    `/events/${encodeURIComponent(eventId)}/check-in`,
  ];

  return (
    <main className="events-shell">
      <AppNavbar eventId={eventId} />
      <header className="events-heading">
        <p className="eyebrow">APERÇU DE L’ÉVÉNEMENT · {event.status}</p>
        <h1>{event.name}</h1>
        <p>Suivez les étapes de préparation de votre événement.</p>
      </header>
      <section className="event-overview-steps" id="ceremonies">
        <h2>Votre parcours</h2>
        <ol>
          {steps.map(([title, description], index) => (
            <li key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{title}</strong>
                <small>{description}</small>
              </div>
              <Link href={urls[index]!}>Ouvrir →</Link>
            </li>
          ))}
        </ol>
        <p>{event.ceremonies?.length ?? 0} cérémonie(s) configurée(s)</p>
      </section>
    </main>
  );
}
