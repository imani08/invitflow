import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { deriveEventJourneyStatuses, EVENT_JOURNEY_STEPS, eventJourneyResumeDestination } from './event-journey.mjs';

test('journey follows the six storyboard screens with optional tools outside progression', () => {
  assert.deepEqual(EVENT_JOURNEY_STEPS.map(({ id }) => id), [
    'event', 'ceremonies', 'designs', 'guests', 'invitations', 'thanks',
  ]);
  assert.equal(EVENT_JOURNEY_STEPS.length, 6);
});

test('journey statuses reflect available event, guest, design and invitation facts conservatively', () => {
  assert.deepEqual(deriveEventJourneyStatuses({ ceremonyCount: 0, guestCount: 0, designCount: 0, hasCompletedBatch: false }), {
    event: 'COMPLETED', ceremonies: 'NOT_STARTED', guests: 'NOT_STARTED', seating: 'OPTIONAL',
    designs: 'NOT_STARTED', invitations: 'BLOCKED', checkin: 'BLOCKED', thanks: 'BLOCKED',
  });
  assert.deepEqual(deriveEventJourneyStatuses({ ceremonyCount: 2, guestCount: 12, designCount: 1, hasCompletedBatch: true }), {
    event: 'COMPLETED', ceremonies: 'COMPLETED', guests: 'IN_PROGRESS', seating: 'OPTIONAL',
    designs: 'IN_PROGRESS', invitations: 'IN_PROGRESS', checkin: 'READY', thanks: 'READY',
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

test('resume uses persisted progress and keeps completed or pending generations accessible', () => {
  const facts = { ceremonyCount: 1, hasSelectedDesign: true, guestCount: 0, batchCount: 0 };
  assert.equal(eventJourneyResumeDestination('event', facts), '/events/event/guests');
  assert.equal(eventJourneyResumeDestination('event', { ...facts, hasSelectedDesign: false }), '/events/event/designs');
  assert.equal(eventJourneyResumeDestination('event', { ...facts, guestCount: 2 }), '/events/event/invitations');
  assert.equal(eventJourneyResumeDestination('event', { ...facts, batchCount: 1 }), '/events/event/invitations');
  assert.match(eventJourneyResumeDestination('event', { ...facts, ceremonyCount: 0 }), /#ceremony-event$/);
  assert.throws(() => eventJourneyResumeDestination('event', { ...facts, guestCount: null }));
});

test('ceremony screen offers the next step and guest writes refresh the progression', async () => {
  const events = await readFile(new URL('../app/events/workspace.tsx', import.meta.url), 'utf8');
  assert.match(events, /<EventJourney eventId=\{event.id\} activeStep="ceremonies"/);
  const guests = await readFile(new URL('../app/events/[eventId]/guests/workspace.tsx', import.meta.url), 'utf8');
  assert.match(guests, /invitaflow:journey-updated/);
  const journey = await readFile(new URL('../components/event-journey.tsx', import.meta.url), 'utf8');
  assert.match(journey, /invitaflow:journey-updated/);
  assert.match(journey, /Étape précédente/);
  assert.match(journey, /invitations\/merci/);
});
