export function confirmationState(batch: unknown, now?: number): 'unavailable' | 'pending' | 'failed' | 'expired' | 'ready';
export function generationMessage(batch: { status: string; completedItems: number; failedItems: number; settledAt?: string | null; settlementCredits?: number | null; zipExpiresAt?: string | null; zipDeletedAt?: string | null }, now?: number): string;

export function singlePdfItem(batch: unknown): { id: string } | null;
