const ISO_TIMESTAMP = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3}))?)?(Z|([+-])(\d\d):(\d\d))$/;

export function parseIsoTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', , zone, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const daysInMonth = month >= 1 && month <= 12 ? daysPerMonth[month - 1] ?? 0 : 0;

  if (year < 1 || day < 1 || day > daysInMonth || hour > 23 || minute > 59 || second > 59) return null;
  if (zone !== 'Z') {
    const offsetHours = Number(offsetHourText);
    const offsetMinutes = Number(offsetMinuteText);
    if (offsetMinutes > 59 || offsetHours > 14 || (offsetHours === 14 && offsetMinutes !== 0)) return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function timestampMatchesTimeZone(value: string, timeZone: string): boolean {
  const date = parseIsoTimestamp(value);
  if (!date) return false;
  const match = ISO_TIMESTAMP.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second = '0', fraction = '0'] = match;
  let local: Record<string, string>;
  try {
    local = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((part) => [part.type, part.value]));
  } catch {
    return false;
  }
  const milliseconds = Number(fraction.padEnd(3, '0'));
  return Number(local['year']) === Number(year)
    && Number(local['month']) === Number(month)
    && Number(local['day']) === Number(day)
    && Number(local['hour']) === Number(hour)
    && Number(local['minute']) === Number(minute)
    && Number(local['second']) === Number(second)
    && date.getUTCMilliseconds() === milliseconds;
}
