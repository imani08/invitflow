export function confirmationState(batch, now = Date.now()) {
  if (!batch || typeof batch !== 'object') return 'unavailable';
  if (['RESERVING', 'QUEUED', 'GENERATING', 'FINALIZING'].includes(batch.status)) return 'pending';
  if (!['COMPLETED', 'PARTIAL', 'CANCELLED'].includes(batch.status) || !batch.settledAt || !Number.isSafeInteger(batch.settlementCredits) || batch.settlementCredits <= 0) return 'failed';
  const expiry = batch.zipExpiresAt == null ? null : Date.parse(batch.zipExpiresAt);
  if (batch.zipDeletedAt || expiry !== null && (!Number.isFinite(expiry) || expiry <= now)) return 'expired';
  return 'ready';
}
