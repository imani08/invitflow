export type DateReminder = 'SEVEN_DAYS' | 'ONE_DAY' | 'DAY_OF';

function calendarKey(value: Date, timezone: string) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value).map((part) => [part.type, part.value]));
    if (!parts['year'] || !parts['month'] || !parts['day']) return null;
    return `${parts['year']}-${parts['month']}-${parts['day']}`;
  } catch {
    return null;
  }
}

export function dateReminderKind(targetAt: Date, timezone: string, now = new Date()): DateReminder | null {
  const target = calendarKey(targetAt, timezone);
  const current = calendarKey(now, timezone);
  if (!target || !current) return null;
  const targetDay = Date.parse(`${target}T00:00:00Z`);
  const currentDay = Date.parse(`${current}T00:00:00Z`);
  const days = Math.round((targetDay - currentDay) / 86_400_000);
  return days === 7 ? 'SEVEN_DAYS' : days === 1 ? 'ONE_DAY' : days === 0 ? 'DAY_OF' : null;
}

export function dateReminderKey(targetType: 'EVENT' | 'CEREMONY', targetId: string, kind: DateReminder) {
  return `${targetType}:${targetId}:${kind}`;
}
