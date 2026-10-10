export const EVENT_JOURNEY_STEPS = [
  { id: 'event', label: 'Événement' },
  { id: 'ceremonies', label: 'Cérémonies' },
  { id: 'guests', label: 'Invités' },
  { id: 'seating', label: 'Placement', optional: true },
  { id: 'designs', label: 'Design' },
  { id: 'invitations', label: 'Invitations' },
  { id: 'checkin', label: 'Check-in' },
];

export function deriveEventJourneyStatuses({ ceremonyCount, guestCount, designCount, hasCompletedBatch }) {
  return {
    event: 'COMPLETED',
    ceremonies: ceremonyCount === null ? 'UNKNOWN' : ceremonyCount > 0 ? 'COMPLETED' : 'NOT_STARTED',
    guests: guestCount === null ? 'UNKNOWN' : guestCount > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
    seating: 'OPTIONAL',
    designs: designCount === null ? 'UNKNOWN' : designCount > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
    invitations: guestCount === null || designCount === null
      ? 'UNKNOWN'
      : ceremonyCount === 0 || guestCount === 0 || designCount === 0 ? 'BLOCKED' : 'IN_PROGRESS',
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
