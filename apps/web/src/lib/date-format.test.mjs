import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APPLICATION_TIME_ZONE, formatDateTime } from './date-format.mjs';

test('date and time display is stable in the configured application timezone', () => {
  const value = '2026-10-06T11:59:14.000Z';
  const utc = formatDateTime(value);
  const kinshasa = formatDateTime(value);

  assert.equal(APPLICATION_TIME_ZONE, 'Africa/Kinshasa');
  assert.equal(utc, kinshasa);
  assert.match(utc, /06\/10\/2026\s+12:59:14/);
});
