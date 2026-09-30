export type Ceremony = {
  id: string; name: string; ceremonyType: string; description: string | null;
  location: string | null; address: string | null; latitude: number | null;
  longitude: number | null; startAt: string; endAt: string | null; timezone: string;
  status: string; instructions: string | null; dressCode: string | null;
  notes: string | null; capacity: number | null;
};

export type Event = {
  id: string; name: string; description: string | null; eventType: string;
  status: string; startAt: string | null; endAt: string | null;
  timezone: string; ceremonies: Ceremony[];
};
