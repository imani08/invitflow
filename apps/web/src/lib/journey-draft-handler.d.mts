import type { DraftRecord } from './draft-save-queue.mjs';
export function handleJourneyDraft(request: Request, dependencies: {
  origin: string; owner(): Promise<string | null>; eventAccess(eventId: string): Promise<number>;
  read(owner: string, scope: string): Promise<DraftRecord>;
  save(owner: string, scope: string, revision: number, data: Record<string, unknown>, path: string): Promise<DraftRecord | null>;
}): Promise<Response>;
