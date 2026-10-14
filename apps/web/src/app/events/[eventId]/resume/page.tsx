import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { eventJourneyResumeDestination } from '@/lib/event-journey.mjs';
import { parseDesignEvent } from '@/lib/design-event-contract.mjs';
import { readJourneyProgress } from '@/lib/journey-draft-store';
import { journeyDestination } from '@/lib/journey-draft-policy.mjs';

export const dynamic = 'force-dynamic';

export default async function ResumePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const session = await getSession((await cookies()).get(sessionCookieName())?.value);
  if (!session) redirect(`/api/auth/login?returnTo=${encodeURIComponent(`/events/${eventId}/resume`)}`);
  const base = `${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events/${encodeURIComponent(eventId)}`;
  let destination: string;
  try {
    const read = async (suffix: string) => {
      const response = await fetch(base + suffix, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error('Parcours indisponible');
      return response.json();
    };
    const event = await read('');
    const progress = journeyDestination(await readJourneyProgress(session.user.sub, eventId));
    if (progress?.eventId === eventId) destination = progress.path;
    else {
    const [designs, guests, batches] = await Promise.all([read('/designs'), read('/guests'), read('/invitations/batches')]);
    const parsed = parseDesignEvent(event);
    if (!Array.isArray(designs.items) || !Array.isArray(guests.items) || !Array.isArray(batches)) throw new Error('Contrat de parcours invalide');
    const selection = designs.selection;
    const hasSelectedDesign = Boolean(selection && designs.items.some((design: { id: string; version: number }) => design.id === selection.designId && design.version === selection.version));
    destination = eventJourneyResumeDestination(eventId, { ceremonyCount: parsed.ceremonies.length, ceremonyRequired: parsed.eventType === 'WEDDING', hasSelectedDesign, guestCount: guests.items.length, batchCount: batches.length });
    }
  } catch {
    return <main className="events-shell"><h1>Votre parcours est momentanément indisponible.</h1><p>Votre travail enregistré est conservé.</p><a href={`/events/${encodeURIComponent(eventId)}/resume`}>Réessayer</a> · <Link href="/events">Mes événements</Link></main>;
  }
  redirect(destination);
}
