export const APPLICATION_TIME_ZONE = 'Africa/Kinshasa';

export function formatDateTime(value, options = {}) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: APPLICATION_TIME_ZONE,
    ...options,
  }).format(new Date(value));
}

export function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeZone: APPLICATION_TIME_ZONE,
    ...options,
  }).format(new Date(value));
}

export function formatDateTimeInTimeZone(value, timeZone, options = {}) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
    ...options,
  }).format(new Date(value));
}
