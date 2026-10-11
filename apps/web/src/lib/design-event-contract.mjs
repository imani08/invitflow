/** The Events detail endpoint promises a ceremony collection, including when empty. */
export function parseDesignEvent(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || typeof payload.id !== 'string' || typeof payload.name !== 'string'
    || typeof payload.status !== 'string' || typeof payload.timezone !== 'string'
    || !Array.isArray(payload.ceremonies)
    || payload.ceremonies.some(ceremony => !ceremony || typeof ceremony !== 'object'
      || typeof ceremony.id !== 'string' || typeof ceremony.name !== 'string'
      || typeof ceremony.ceremonyType !== 'string')) {
    throw new Error('Les données de l’événement sont incomplètes. Réessayez le chargement.');
  }
  return payload;
}
