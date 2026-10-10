import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CEREMONY_TIME_RANGE_ERROR, ceremonyTimeRangeError } from '../../lib/ceremony-time-range.mjs';

test('all event, ceremony and program datetime writes use the offset-aware converter', async () => {
  const workspace = await readFile(new URL('./workspace.tsx', import.meta.url), 'utf8');
  assert.equal([...workspace.matchAll(/localTimeInZone\(/g)].length, 10);
});

test('successful event creation opens its event workspace for ceremony setup', async () => {
  const workspace = await readFile(new URL('./workspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /router\.push\(`\/events\/\$\{encodeURIComponent\(created\.id\)\}`\)/);
  assert.match(workspace, /id=\{`ceremony-\$\{event\.id\}`\}/);
  assert.match(workspace, /window\.location\.hash\.startsWith\('#ceremony-'\)/);
});

test('event API errors preserve safe Nest message strings and validation arrays', async () => {
  const workspace = await readFile(new URL('./workspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /typeof message === 'string' \? message : Array\.isArray\(message\)/);
  assert.match(workspace, /message\.filter\(\(part\): part is string => typeof part === 'string'\)\.join\(' '\)/);
  assert.doesNotMatch(workspace, /\.stack/);
});

test('ceremony end time must be after start time, while an omitted end time is allowed', () => {
  assert.equal(ceremonyTimeRangeError('2026-10-10T10:00', '2026-10-10T11:00'), null);
  assert.equal(ceremonyTimeRangeError('2026-10-10T10:00', '2026-10-10T10:00'), CEREMONY_TIME_RANGE_ERROR);
  assert.equal(ceremonyTimeRangeError('2026-10-10T10:00', '2026-10-10T09:59'), CEREMONY_TIME_RANGE_ERROR);
  assert.equal(ceremonyTimeRangeError('2026-10-10T10:00', ''), null);
});

test('both ceremony forms constrain end time without changing the entered value', async () => {
  const workspace = await readFile(new URL('./workspace.tsx', import.meta.url), 'utf8');
  assert.equal([...workspace.matchAll(/min=\{localStart \|\| undefined\}/g)].length, 1);
  assert.equal([...workspace.matchAll(/onChange=\{updateCeremonyStartMinimum\}/g)].length, 2);
  assert.equal([...workspace.matchAll(/onInvalid=\{showCeremonyEndAtError\}/g)].length, 2);
  assert.match(workspace, /endAtInput\.min = event\.currentTarget\.value/);
  assert.doesNotMatch(workspace, /endAtInput\.value\s*=/);
});
