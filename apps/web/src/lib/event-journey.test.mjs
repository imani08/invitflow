import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { deriveEventJourneyStatuses, EVENT_JOURNEY_STEPS } from './event-journey.mjs';

test('journey step order includes optional seating and the full event lifecycle', () => {
  assert.deepEqual(EVENT_JOURNEY_STEPS.map(({ id }) => id), [
    'event', 'ceremonies', 'guests', 'seating', 'designs', 'invitations', 'checkin',
  ]);
  assert.equal(EVENT_JOURNEY_STEPS.find(({ id }) => id === 'seating')?.optional, true);
});

test('journey statuses reflect available event, guest, design and invitation facts conservatively', () => {
  assert.deepEqual(deriveEventJourneyStatuses({ ceremonyCount: 0, guestCount: 0, designCount: 0, hasCompletedBatch: false }), {
    event: 'COMPLETED', ceremonies: 'NOT_STARTED', guests: 'NOT_STARTED', seating: 'OPTIONAL',
    designs: 'NOT_STARTED', invitations: 'BLOCKED', checkin: 'BLOCKED',
  });
  assert.deepEqual(deriveEventJourneyStatuses({ ceremonyCount: 2, guestCount: 12, designCount: 1, hasCompletedBatch: true }), {
    event: 'COMPLETED', ceremonies: 'COMPLETED', guests: 'IN_PROGRESS', seating: 'OPTIONAL',
    designs: 'IN_PROGRESS', invitations: 'IN_PROGRESS', checkin: 'READY',
  });
  assert.equal(deriveEventJourneyStatuses({ ceremonyCount: 1, guestCount: null, designCount: null, hasCompletedBatch: null }).invitations, 'UNKNOWN');
});

test('journey renders destinations bound to the current event and a data-driven primary action', async () => {
  const component = await readFile(new URL('../components/event-journey.tsx', import.meta.url), 'utf8');
  assert.match(component, /\/events\/\$\{encodeURIComponent\(eventId\)\}\/guests/);
  assert.match(component, /\/events\/\$\{encodeURIComponent\(eventId\)\}\/designs/);
  assert.match(component, /\/events\/\$\{encodeURIComponent\(eventId\)\}\/invitations/);
  assert.match(component, /aria-current=\{step\.id === activeStep \? 'step' : undefined\}/);
  assert.match(component, /Le placement reste facultatif/);
  assert.match(component, /Le service vérifiera le design, les accès et les crédits/);
});
