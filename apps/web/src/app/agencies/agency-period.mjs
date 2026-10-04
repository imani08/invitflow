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

/** @param {{status: string, quotaCredits: number} | null} plan @param {{consumed: number, reserved: number}} usage */
export function agencyCreditUsage(plan, usage) {
  if (!plan || plan.status !== 'ACTIVE' || !Number.isSafeInteger(plan.quotaCredits) || plan.quotaCredits < 0 || !Number.isSafeInteger(usage.consumed) || usage.consumed < 0 || !Number.isSafeInteger(usage.reserved) || usage.reserved < 0) {
    return { included: null, consumed: null, reserved: null, available: null };
  }
  return { included: plan.quotaCredits, consumed: usage.consumed, reserved: usage.reserved, available: Math.max(0, plan.quotaCredits - usage.consumed - usage.reserved) };
}

/** @param {{agencyClientEvents?: Array<{clientId: string}>} | null | undefined} event @param {string} clientId */
export function belongsToAgencyClient(event, clientId) {
  return Boolean(clientId && event?.agencyClientEvents?.some((relation) => relation.clientId === clientId));
}
