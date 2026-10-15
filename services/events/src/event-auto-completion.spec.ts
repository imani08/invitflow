import assert from 'node:assert/strict';
import test from 'node:test';
import { isEventDueForAutomaticCompletion, lastProgramMoment } from './event-auto-completion.js';

const published = { status: 'PUBLISHED', timezone: 'Africa/Kinshasa', startAt: null, endAt: null };

test('automatic completion begins on local J+1 of the final active program moment', () => {
  const candidate = { ...published, ceremonies: [{ status: 'SCHEDULED', startAt: new Date('2026-10-15T07:00:00.000Z'), endAt: new Date('2026-10-15T18:00:00.000Z') }] };
  assert.equal(isEventDueForAutomaticCompletion(candidate, new Date('2026-10-15T22:59:00.000Z')), false);
  assert.equal(isEventDueForAutomaticCompletion(candidate, new Date('2026-10-16T00:00:00.000Z')), true);
});

test('the final active ceremony wins and cancelled moments do not keep an event open', () => {
  const candidate = { ...published, ceremonies: [
    { status: 'SCHEDULED', startAt: new Date('2026-10-14T07:00:00.000Z'), endAt: null },
    { status: 'CANCELLED', startAt: new Date('2026-10-20T07:00:00.000Z'), endAt: null },
  ] };
  assert.equal(lastProgramMoment(candidate)?.toISOString(), '2026-10-14T07:00:00.000Z');
  assert.equal(isEventDueForAutomaticCompletion(candidate, new Date('2026-10-15T07:00:00.000Z')), true);
});

test('events without a program use their scheduled event date and never close drafts', () => {
  const candidate = { ...published, startAt: new Date('2026-10-15T07:00:00.000Z'), endAt: null, ceremonies: [] };
  assert.equal(isEventDueForAutomaticCompletion(candidate, new Date('2026-10-16T07:00:00.000Z')), true);
  assert.equal(isEventDueForAutomaticCompletion({ ...candidate, status: 'DRAFT' }, new Date('2026-10-16T07:00:00.000Z')), false);
});
