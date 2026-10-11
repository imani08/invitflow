export const DRAFT_MAX_BYTES: number;
export const DRAFT_TTL_SECONDS: number;
export const DRAFT_COMPARE_AND_SET: string;
export function journeyDestination(value: unknown): { path: string; scope: string; eventId: string | null } | null;
export function validateDraft(value: unknown): Record<string, unknown>;
