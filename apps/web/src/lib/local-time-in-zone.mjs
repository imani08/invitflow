const LOCAL_DATE_TIME = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)$/;

/** Convert a datetime-local value into its local wall time with the IANA offset for that date. */
export function localTimeInZone(value, timeZone) {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) throw new Error('Saisissez une date et une heure valides.');

  const target = match.slice(1).map(Number);
  const targetUtc = Date.UTC(target[0], target[1] - 1, target[2], target[3], target[4]);
  let candidate = targetUtc;
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch {
    throw new Error('Le fuseau horaire sélectionné est invalide.');
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value: partValue }) => [type, partValue]));
    const representedUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    const adjustment = targetUtc - representedUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  const local = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map(({ type, value: partValue }) => [type, partValue]));
  if (Number(local.year) !== target[0] || Number(local.month) !== target[1] || Number(local.day) !== target[2]
    || Number(local.hour) !== target[3] || Number(local.minute) !== target[4]) {
    throw new Error('Cette heure n’existe pas dans le fuseau choisi à cause du changement d’heure.');
  }

  const offsetMinutes = (Date.UTC(Number(local.year), Number(local.month) - 1, Number(local.day), Number(local.hour), Number(local.minute)) - candidate) / 60_000;
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00${offset}`;
}
