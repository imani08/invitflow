import assert from 'node:assert/strict';
import test from 'node:test';
import { ceremonyCheckInExpiry } from './checkin-link-expiry.js';

test('check-in links expire at the exclusive start of J+2 in the ceremony timezone', () => {
  const expiry = ceremonyCheckInExpiry({ startAt: new Date('2026-07-18T09:00:00.000Z') }, 'Africa/Kinshasa');
  assert.equal(expiry.toISOString(), '2026-07-19T23:00:00.000Z');
});

test('an overnight ceremony uses its local end date as the expiry reference', () => {
  const expiry = ceremonyCheckInExpiry({ startAt: new Date('2026-07-18T21:00:00.000Z'), endAt: new Date('2026-07-19T01:00:00.000Z') }, 'Africa/Kinshasa');
  assert.equal(expiry.toISOString(), '2026-07-20T23:00:00.000Z');
});
