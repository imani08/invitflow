export type EventFields = {
  name?: string;
  description?: string | null;
  eventType?: string;
  startAt?: Date | null;
  endAt?: Date | null;
  timezone?: string;
};

export type CreateEventFields = EventFields & { name: string; eventType: string };

export type CeremonyFields = {
  name?: string;
  ceremonyType?: string;
  description?: string | null;
  location?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  instructions?: string | null;
  dressCode?: string | null;
  notes?: string | null;
  capacity?: number | null;
  startAt?: Date;
  endAt?: Date | null;
  timezone?: string;
};

export type CreateCeremonyFields = CeremonyFields & { name: string; ceremonyType: string; startAt: Date };
