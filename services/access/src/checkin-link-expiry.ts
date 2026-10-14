type CeremonyTiming = { startAt: Date; endAt?: Date | null; timezone?: string };

function partsAt(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

// Converts a wall-clock time in an IANA zone to UTC. Repeating the offset
// calculation makes the result stable over DST transitions without relying on
// the browser timezone or on a "48 hours from now" approximation.
function zonedTimeToUtc(year: number, month: number, day: number, timezone: string) {
  const target = Date.UTC(year, month - 1, day);
  let candidate = target;
  for (let i = 0; i < 3; i += 1) {
    const actual = partsAt(new Date(candidate), timezone);
    const rendered = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate += target - rendered;
  }
  return new Date(candidate);
}

export function ceremonyCheckInExpiry(timing: CeremonyTiming, eventTimezone: string) {
  const timezone = timing.timezone || eventTimezone;
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
  catch { throw new Error('Fuseau horaire de l’événement invalide.'); }
  const reference = timing.endAt ?? timing.startAt;
  const local = partsAt(reference, timezone);
  const afterTomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day + 2));
  return zonedTimeToUtc(afterTomorrow.getUTCFullYear(), afterTomorrow.getUTCMonth() + 1, afterTomorrow.getUTCDate(), timezone);
}

export function linkExpiry(timings: CeremonyTiming[], eventTimezone: string, eventTiming?: CeremonyTiming) {
  if (!timings.length && !eventTiming) throw new Error('Au moins un moment daté est requis pour créer un lien de pointage.');
  const all = timings.length ? timings : (eventTiming ? [eventTiming] : []);
  return all.map((timing) => ceremonyCheckInExpiry(timing, eventTimezone)).reduce((latest, value) => value > latest ? value : latest);
}
