export const CEREMONY_TIME_RANGE_ERROR = 'L’heure de fin doit être postérieure à l’heure de début.';

export function ceremonyTimeRangeError(startAt, endAt) {
  if (!endAt) return null;
  if (!startAt || endAt <= startAt) return CEREMONY_TIME_RANGE_ERROR;
  return null;
}
