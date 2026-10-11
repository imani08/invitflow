import { createHash } from 'node:crypto';
export function emissionRequestHash(eventId, designId, version, guestIds) {
  return createHash('sha256').update(JSON.stringify({ eventId, designId, version: version ?? null, guests: guestIds.length ? [...new Set(guestIds)].sort() : 'ALL' })).digest('hex');
}
export function isFundedBatch(batch) {
  return !!batch.settledAt && Number.isSafeInteger(batch.settlementCredits) && batch.settlementCredits >= 0 && ['COMPLETED', 'PARTIAL', 'CANCELLED'].includes(batch.status);
}
export function finalBatchStatus(generated, total, cancelled) {
  return cancelled ? 'CANCELLED' : generated === total ? 'COMPLETED' : generated > 0 ? 'PARTIAL' : 'FAILED';
}
