export const CEREMONY_TIME_RANGE_ERROR = 'L’heure de fin doit être postérieure à l’heure de début.';

export function ceremonyTimeRangeError(startAt, endAt) {
  if (!endAt) return null;
  if (!startAt || endAt <= startAt) return CEREMONY_TIME_RANGE_ERROR;
  return null;
}

export function ceremonyFieldErrors(message) {
  const labels = { name: 'le nom', startAt: 'la date et l’heure de début', endAt: 'la date et l’heure de fin', timezone: 'le fuseau horaire', capacity: 'la capacité', latitude: 'la latitude', longitude: 'la longitude', location: 'le lieu', address: 'l’adresse', description: 'la description', instructions: 'les instructions', notes: 'les notes', dressCode: 'la tenue', ceremonyType: 'le type de moment' };
  /** @type {Record<string, string>} */
  const fields = {};
  for (const part of String(message).split(/\.\s+|\n|;\s*/)) {
    const name = Object.keys(labels).find(key => new RegExp('^' + key + '\\b', 'i').test(part.trim()));
    if (name) fields[name] = name === 'endAt' && /after startAt/.test(part) ? CEREMONY_TIME_RANGE_ERROR : `Vérifiez ${labels[name]}. ${part.trim()}`;
  }
  return fields;
}
