type ProgramMoment = { status: string; startAt: Date; endAt: Date | null };

export type AutoCompletionCandidate = {
  status: string;
  timezone: string;
  startAt: Date | null;
  endAt: Date | null;
  ceremonies: ProgramMoment[];
};

function localCalendarDay(value: Date, timeZone: string): string | null {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value).map((part) => [part.type, part.value]));
    const { year, month, day } = parts;
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

export function lastProgramMoment(candidate: AutoCompletionCandidate): Date | null {
  const moments = candidate.ceremonies
    .filter((ceremony) => ceremony.status !== 'CANCELLED')
    .map((ceremony) => ceremony.endAt ?? ceremony.startAt);
  if (moments.length) return moments.reduce((latest, value) => value > latest ? value : latest);
  return candidate.endAt ?? candidate.startAt;
}

/** The event closes at the beginning of local day J+1, after its final program date. */
export function isEventDueForAutomaticCompletion(candidate: AutoCompletionCandidate, now = new Date()): boolean {
  if (candidate.status !== 'PUBLISHED') return false;
  const lastMoment = lastProgramMoment(candidate);
  if (!lastMoment) return false;
  const finalDay = localCalendarDay(lastMoment, candidate.timezone);
  const currentDay = localCalendarDay(now, candidate.timezone);
  return finalDay !== null && currentDay !== null && currentDay > finalDay;
}
