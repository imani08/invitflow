import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIsoTimestamp, timestampMatchesTimeZone } from './events-date.js';

test('accepts valid leap days and preserves explicit timezone offsets', () => {
  assert.equal(parseIsoTimestamp('2024-02-29T12:30Z')?.toISOString(), '2024-02-29T12:30:00.000Z');
  assert.equal(parseIsoTimestamp('2026-07-01T12:30:15.1+02:00')?.toISOString(), '2026-07-01T10:30:15.100Z');
});

test('rejects impossible calendar dates and clock values instead of normalizing them', () => {
  for (const value of ['2026-02-29T12:00Z', '2024-02-30T12:00Z', '2026-04-31T12:00Z', '2026-10-25T24:00Z', '2026-10-25T12:60Z', '2026-10-25T12:00:60Z']) {
    assert.equal(parseIsoTimestamp(value), null, value);
  }
});

test('requires a valid explicit UTC designator or offset', () => {
  for (const value of ['2026-10-25T12:00', '2026-10-25T12:00+14:01', '2026-10-25T12:00-15:00', '2026-10-25T12:00+02:60']) {
    assert.equal(parseIsoTimestamp(value), null, value);
  }
});

test('checks local wall time against the selected timezone across DST boundaries', () => {
  assert.equal(timestampMatchesTimeZone('2026-01-15T12:00:00+01:00', 'Europe/Paris'), true);
  assert.equal(timestampMatchesTimeZone('2026-01-15T12:00:00Z', 'Europe/Paris'), false);
  assert.equal(timestampMatchesTimeZone('2026-03-29T02:30:00+01:00', 'Europe/Paris'), false);
  assert.equal(timestampMatchesTimeZone('2026-03-29T03:30:00+02:00', 'Europe/Paris'), true);
  assert.equal(timestampMatchesTimeZone('2026-10-25T02:30:00+02:00', 'Europe/Paris'), true);
  assert.equal(timestampMatchesTimeZone('2026-10-25T02:30:00+01:00', 'Europe/Paris'), true);
});
