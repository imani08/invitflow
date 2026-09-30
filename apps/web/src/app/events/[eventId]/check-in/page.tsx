import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { CheckInWorkspace } from './workspace';
import './check-in.css';

export const dynamic = 'force-dynamic';
export default async function CheckInPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params; const store = await cookies(); const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/check-in`)}`);
  try {
    const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events/${encodeURIComponent(eventId)}`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (response.status === 401) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/check-in`)}`);
    if (response.status === 404) notFound(); if (!response.ok) throw new Error('event_unavailable');
    const event = await response.json() as { id: string; name: string; ceremonies?: { id: string; name: string; startAt?: string }[] };
    return <main className="check-shell"><nav><a href="/events">← Mes événements</a><a href={`/events/${eventId}/invitations`}>Invitations</a></nav><header><p>ACCUEIL DES INVITÉS</p><h1>{event.name}</h1><span>Scannez le QR de l’invitation ou saisissez son code.</span></header><CheckInWorkspace eventId={eventId} ceremonies={event.ceremonies ?? []} /></main>;
  } catch (error) { if (error && typeof error === 'object' && 'digest' in error) throw error; return <main className="check-shell"><h1>Pointage indisponible</h1><p>Réessayez lorsque les services seront accessibles.</p></main>; }
}
