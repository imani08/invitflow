export function confirmationState(batch, now = Date.now()) {
  if (!batch || typeof batch !== 'object') return 'unavailable';
  if (batch.status !== 'COMPLETED') return ['RESERVING', 'QUEUED', 'GENERATING'].includes(batch.status) ? 'pending' : 'failed';
  const expiry = batch.zipExpiresAt == null ? null : Date.parse(batch.zipExpiresAt);
  if (batch.zipDeletedAt || expiry !== null && (!Number.isFinite(expiry) || expiry <= now)) return 'expired';
  return 'ready';
}
