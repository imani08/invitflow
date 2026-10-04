import assert from 'node:assert/strict';
import test from 'node:test';
import { agencyPeriod, agencyCreditUsage, belongsToAgencyClient, AGENCY_PERIOD_MS } from './agency-period.mjs';

const start = Date.UTC(2026, 9, 10, 14, 30);
const end = new Date(start + AGENCY_PERIOD_MS).toISOString();
const startISO = new Date(start).toISOString();

test('agency period has exactly 30 days and expires at the exact end instant', () => {
  assert.equal(agencyPeriod(startISO, end, start).end - start, 30 * 86_400_000);
  assert.equal(agencyPeriod(startISO, end, start + AGENCY_PERIOD_MS - 1).expired, false);
  assert.equal(agencyPeriod(startISO, end, start + AGENCY_PERIOD_MS).expired, true);
});

test('active and expired period states expose truthful day and progress values', () => {
  const active = agencyPeriod(startISO, end, start + 11 * 86_400_000);
  assert.equal(active.active, true);
  assert.equal(active.day, 12);
  assert.ok(Math.abs(active.progress - 36.666666666666664) < 0.000001);
  const expired = agencyPeriod(startISO, end, start + AGENCY_PERIOD_MS);
  assert.equal(expired.active, false);
  assert.equal(expired.daysRemaining, 0);
});

test('invalid historical duration has no fabricated 30-day progress', () => {
  assert.equal(agencyPeriod(startISO, new Date(start + 31 * 86_400_000).toISOString(), start), null);
});

test('agency credits are available only from an active subscription quota', () => {
  assert.deepEqual(agencyCreditUsage({ status: 'ACTIVE', quotaCredits: 500 }, { consumed: 120, reserved: 30 }), { included: 500, consumed: 120, reserved: 30, available: 350 });
  assert.deepEqual(agencyCreditUsage({ status: 'PENDING', quotaCredits: 500 }, { consumed: 0, reserved: 0 }), { included: null, consumed: null, reserved: null, available: null });
  assert.equal(agencyCreditUsage({ status: 'ACTIVE', quotaCredits: 500 }, { consumed: 100, reserved: 50 }).available, 350);
});

test('client event filtering requires a client association returned by the API', () => {
  assert.equal(belongsToAgencyClient({ agencyClientEvents: [{ clientId: 'client-a' }] }, 'client-a'), true);
  assert.equal(belongsToAgencyClient({ agencyClientEvents: [{ clientId: 'client-a' }] }, 'client-b'), false);
  assert.equal(belongsToAgencyClient({ id: 'event-without-association' }, 'client-a'), false);
});
