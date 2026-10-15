export const EVENT_JOURNEY_STEPS = [
  { id: 'event', label: 'Événement' },
  { id: 'ceremonies', label: 'Programme' },
  { id: 'designs', label: 'Design et textes' },
  { id: 'guests', label: 'Invités' },
  { id: 'invitations', label: 'Invitations' },
  { id: 'checkin', label: 'Pointage' },
  { id: 'thanks', label: 'Merci' },
];

export function eventJourneyResumeDestination(eventId, { ceremonyCount, hasSelectedDesign, guestCount, batchCount, ceremonyRequired = true }) {
  if (![ceremonyCount, guestCount, batchCount].every(value => Number.isInteger(value) && value >= 0) || typeof hasSelectedDesign !== 'boolean') throw new Error('État du parcours indisponible.');
  const base = `/events/${encodeURIComponent(eventId)}`;
  if (batchCount > 0) return `${base}/invitations`;
  if (ceremonyRequired && !ceremonyCount) return `/events?event=${encodeURIComponent(eventId)}#ceremony-${encodeURIComponent(eventId)}`;
  if (!hasSelectedDesign) return `${base}/designs`;
  return `${base}/${guestCount ? 'invitations' : 'guests'}`;
}

export function deriveEventJourneyStatuses({ ceremonyCount, guestCount, designCount, hasCompletedBatch, ceremonyRequired = true }) {
  return {
    event: 'COMPLETED',
    ceremonies: ceremonyCount === null ? 'UNKNOWN' : ceremonyCount > 0 ? 'COMPLETED' : ceremonyRequired ? 'NOT_STARTED' : 'OPTIONAL',
    guests: guestCount === null ? 'UNKNOWN' : guestCount > 0 ? 'COMPLETED' : 'NOT_STARTED',
    seating: 'OPTIONAL',
    designs: designCount === null ? 'UNKNOWN' : designCount > 0 ? 'COMPLETED' : 'NOT_STARTED',
    invitations: guestCount === null || designCount === null
      ? 'UNKNOWN'
      : (ceremonyRequired && ceremonyCount === 0) || guestCount === 0 || designCount === 0 ? 'BLOCKED' : hasCompletedBatch ? 'COMPLETED' : 'IN_PROGRESS',
    thanks: hasCompletedBatch === null ? 'UNKNOWN' : hasCompletedBatch ? 'READY' : 'BLOCKED',
    checkin: hasCompletedBatch === null ? 'UNKNOWN' : hasCompletedBatch ? 'READY' : 'BLOCKED',
  };
}

export function eventJourneyStatusLabel(status) {
  return ({
    COMPLETED: 'Terminé',
    IN_PROGRESS: 'En cours',
    READY: 'Prêt',
    OPTIONAL: 'Facultatif',
    NOT_STARTED: 'À préparer',
    BLOCKED: 'À débloquer',
    UNKNOWN: 'État à vérifier',
  })[status] ?? 'État à vérifier';
}
