export const AGENCY_PERIOD_DAYS = 30;
export const AGENCY_PERIOD_MS = AGENCY_PERIOD_DAYS * 86_400_000;

/** @param {string | null | undefined} startValue @param {string | null | undefined} endValue @param {number} [now] */
export function agencyPeriod(startValue, endValue, now = Date.now()) {
  if (!startValue || !endValue) return null;
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start !== AGENCY_PERIOD_MS) return null;
  const active = now >= start && now < end;
  const day = active ? Math.min(30, Math.floor((now - start) / 86_400_000) + 1) : now < start ? 0 : 30;
  return { start, end, active, expired: now >= end, day, daysRemaining: Math.max(0, Math.ceil((end - now) / 86_400_000)), progress: Math.max(0, Math.min(100, (now - start) / AGENCY_PERIOD_MS * 100)) };
}
