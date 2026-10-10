export type EventJourneyStatus = 'COMPLETED' | 'IN_PROGRESS' | 'READY' | 'OPTIONAL' | 'NOT_STARTED' | 'BLOCKED' | 'UNKNOWN';
export const EVENT_JOURNEY_STEPS: readonly { id: string; label: string; optional?: boolean }[];
export function deriveEventJourneyStatuses(input: { ceremonyCount: number | null; guestCount: number | null; designCount: number | null; hasCompletedBatch: boolean | null }): Record<'event' | 'ceremonies' | 'guests' | 'seating' | 'designs' | 'invitations' | 'checkin', EventJourneyStatus>;
export function eventJourneyStatusLabel(status: EventJourneyStatus): string;
