export function confirmationState(batch, now = Date.now()) {
  if (!batch || typeof batch !== 'object') return 'unavailable';
  if (['RESERVING', 'QUEUED', 'GENERATING', 'FINALIZING'].includes(batch.status)) return 'pending';
  if (!['COMPLETED', 'PARTIAL', 'CANCELLED'].includes(batch.status) || !batch.settledAt || !Number.isSafeInteger(batch.settlementCredits) || batch.settlementCredits <= 0) return 'failed';
  const expiry = batch.zipExpiresAt == null ? null : Date.parse(batch.zipExpiresAt);
  if (batch.zipDeletedAt || expiry !== null && (!Number.isFinite(expiry) || expiry <= now)) return 'expired';
  return 'ready';
}

export function generationMessage(batch, now = Date.now()) {
  if (['RESERVING', 'QUEUED'].includes(batch.status)) return 'Votre demande est enregistrée. La préparation de vos invitations va commencer.';
  if (['GENERATING', 'FINALIZING'].includes(batch.status)) return 'Vos invitations sont en cours de préparation.';
  if (batch.status === 'FAILED') return 'La préparation de vos invitations a échoué. Consultez le détail et réessayez les invitations en échec.';
  const ready = confirmationState(batch, now) === 'ready';
  if (batch.status === 'PARTIAL') return ready
    ? `${batch.completedItems} invitation(s) disponible(s), ${batch.failedItems} invitation(s) à reprendre.`
    : `${batch.completedItems} invitation(s) préparée(s), ${batch.failedItems} invitation(s) à reprendre. Le téléchargement attend des fichiers disponibles et un financement confirmé.`;
  if (ready) return 'Vos invitations sont prêtes. Vous pouvez les télécharger à nouveau gratuitement.';
  if (batch.status === 'CANCELLED') return 'La préparation a été annulée.';
  if (confirmationState(batch, now) === 'expired') return 'Votre archive a expiré. Régénérez le ZIP des invitations déjà financées.';
  return 'Le téléchargement attend des fichiers disponibles et un financement confirmé.';
}
