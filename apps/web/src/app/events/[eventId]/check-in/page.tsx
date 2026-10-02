import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { BrandLogo } from '@/components/brand-logo';
import { CheckInWorkspace } from './workspace';
import './check-in.css';

export const dynamic = 'force-dynamic';
export default async function CheckInPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params; const store = await cookies(); const session = await getSession(store.get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/check-in`)}`);
  try {
    const gateway = process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002';
    const response = await fetch(`${gateway}/v1/events/${encodeURIComponent(eventId)}`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const isOwner = response.ok;
    let event: { id: string; name: string; ceremonies: { id: string; name: string; startAt?: string }[] };
    if (response.ok) event = await response.json() as typeof event;
    else {
      if (response.status === 401) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/check-in`)}`);
      const context = await fetch(`${gateway}/v1/check-in/events/${encodeURIComponent(eventId)}`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (context.status === 401) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/check-in`)}`);
      if (context.status === 403 || context.status === 404) notFound();
      if (!context.ok) throw new Error('event_unavailable');
      const assignments = await context.json() as { name: string; ceremonies: { id: string; name: string; startAt?: string }[] };
      event = { id: eventId, name: assignments.name || 'Pointage invité', ceremonies: assignments.ceremonies };
    }
    return <main className="check-shell"><nav><BrandLogo variant="compact"/><a href="/events">← Mes événements</a><a href={`/events/${eventId}/invitations`}>Invitations</a></nav><header><p>ACCUEIL DES INVITÉS</p><h1>{event.name}</h1><span>Scannez le QR de l’invitation ou saisissez son code.</span></header><CheckInWorkspace eventId={eventId} ceremonies={event.ceremonies ?? []} isOwner={isOwner} /></main>;
  } catch (error) { if (error && typeof error === 'object' && 'digest' in error) throw error; return <main className="check-shell"><h1>Pointage indisponible</h1><p>Réessayez lorsque les services seront accessibles.</p></main>; }
}
