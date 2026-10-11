export function emissionRequestHash(eventId: string, designId: string, version: number | undefined, guestIds: string[]): string;
export function isFundedBatch(batch: { settledAt?: Date | string | null; settlementCredits?: number | null; status: string }): boolean;
export function finalBatchStatus(generated: number, total: number, cancelled: boolean): 'COMPLETED' | 'PARTIAL' | 'CANCELLED' | 'FAILED';
