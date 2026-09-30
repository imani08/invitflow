/** Versioned public contracts shared by the gateway and domain services. */
export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
export type CeremonyStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';

export type EventSummary = {
  id: string;
  name: string;
  description: string | null;
  eventType: string;
  status: EventStatus;
  startAt: string | null;
  endAt: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  ceremonyCount?: number;
  ceremonies?: CeremonySummary[];
};

export type CeremonySummary = {
  id: string;
  eventId: string;
  name: string;
  ceremonyType: string;
  description: string | null;
  location: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  instructions: string | null;
  dressCode: string | null;
  notes: string | null;
  capacity: number | null;
  startAt: string;
  endAt: string | null;
  timezone: string;
  status: CeremonyStatus;
  createdAt: string;
  updatedAt: string;
};

export type EventCreatedV1 = {
  id: string;
  ownerSubject: string;
  name: string;
  eventType: string;
  occurredAt: string;
  schemaVersion: 1;
};

export type EventPublishedV1 = {
  id: string;
  ownerSubject: string;
  name: string;
  occurredAt: string;
  schemaVersion: 1;
};

export type EventUpdatedV1 = {
  id: string;
  ownerSubject: string;
  changedFields: string[];
  occurredAt: string;
  schemaVersion: 1;
};

export type EventCancelledV1 = {
  id: string;
  ownerSubject: string;
  occurredAt: string;
  schemaVersion: 1;
};

export type CeremonyChangedV1 = {
  eventId: string;
  ceremonyId: string;
  ownerSubject: string;
  occurredAt: string;
  schemaVersion: 1;
};

export type GuestStatus = 'ACTIVE' | 'ARCHIVED';
export type ImportStatus = 'ANALYZED' | 'MAPPED' | 'COMPLETED' | 'FAILED';

export type GuestSummary = {
  id: string;
  ownerSubject: string;
  eventId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: GuestStatus;
  group: { id: string; name: string } | null;
  companions: Array<{ id: string; fullName: string; relationship: string | null }>;
  access: GuestCeremonyAccess[];
  createdAt: string;
  updatedAt: string;
};

export type GuestCeremonyAccess = {
  ceremonyId: string;
  isInvited: boolean;
  allowedCompanions: number;
  tableReference: string | null;
  zoneReference: string | null;
  seatNumber: string | null;
  category: string | null;
  notes: string | null;
};

export type GuestCreatedV1 = { guestId: string; eventId: string; ownerSubject: string; occurredAt: string; schemaVersion: 1 };
export type GuestUpdatedV1 = GuestCreatedV1;
export type GuestArchivedV1 = GuestCreatedV1;
export type GuestImportCompletedV1 = { importJobId: string; eventId: string; ownerSubject: string; importedCount: number; skippedCount: number; occurredAt: string; schemaVersion: 1 };
export type SeatingMode = 'NO_SEATING' | 'TABLE' | 'ZONE';

export type SeatingTable = {
  id: string;
  ceremonyId: string;
  name: string;
  number: number | null;
  capacity: number;
  category: string | null;
  notes: string | null;
  occupied: number;
  overCapacity: boolean;
};

export type SeatingZone = {
  id: string;
  ceremonyId: string;
  name: string;
  capacity: number | null;
  category: string | null;
  notes: string | null;
  occupied: number;
  overCapacity: boolean;
};

export type SeatingAssignment = {
  id: string;
  ceremonyId: string;
  guestId: string;
  tableId: string | null;
  zoneId: string | null;
  seatsReserved: number;
};

export const seatingEventTypes = {
  planUpdated: 'seating.plan.updated.v1',
  tableCreated: 'seating.table.created.v1',
  tableUpdated: 'seating.table.updated.v1',
  tableDeleted: 'seating.table.deleted.v1',
  zoneCreated: 'seating.zone.created.v1',
  zoneUpdated: 'seating.zone.updated.v1',
  zoneDeleted: 'seating.zone.deleted.v1',
  assignmentSaved: 'seating.assignment.saved.v1',
  assignmentRemoved: 'seating.assignment.removed.v1',
  tablesImported: 'seating.tables.imported.v1',
} as const;
