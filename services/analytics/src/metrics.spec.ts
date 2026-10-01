import assert from 'node:assert/strict';
import test from 'node:test';
import { mapAnalyticsEvent } from './metrics.js';

test('maps event, payment, invitation and wallet events into UTC daily deltas without retaining payloads', () => {
  const event = (eventId: string, eventType: string, payload: Record<string, unknown>) =>
    mapAnalyticsEvent({ eventId, eventType, occurredAt: '2026-09-30T23:45:00-04:00', payload });
  assert.deepEqual(event('a', 'events.created.v1', {}), {
    day: new Date('2026-10-01T00:00:00Z'),
    deltas: [{ metric: 'events_created', count: 1 }],
  });
  assert.deepEqual(
    event('b', 'payment.succeeded.v1', {
      ownerSubject: 'private',
      credits: 20,
      amountMinor: 12345,
      currency: 'CDF',
    })?.deltas,
    [
      { metric: 'payments_succeeded', count: 1 },
      { metric: 'credits_sold', count: 20 },
      { metric: 'revenue_minor', count: 1, valueMinor: 12345, currency: 'CDF' },
    ],
  );
  assert.deepEqual(event('c', 'invitation.batch.completed.v1', { generatedCount: 4 })?.deltas, [
    { metric: 'invitations_generated', count: 4 },
    { metric: 'render_total', count: 4 },
  ]);
  assert.deepEqual(event('c2', 'invitation.batch.failed.v1', { failedCount: 4 })?.deltas, [
    { metric: 'invitation_batches_failed', count: 1 },
    { metric: 'render_failures', count: 1 },
  ]);
  assert.deepEqual(event('d', 'invitation.rsvp.updated.v1', { responseCount: 3 })?.deltas, [
    { metric: 'rsvp_responses', count: 3 },
  ]);
  assert.deepEqual(event('e', 'invitation.checkin.created.v1', {})?.deltas, [
    { metric: 'checkins', count: 1 },
  ]);
  assert.deepEqual(
    event('f', 'credits.settled.v1', { availableDelta: 2, reservedDelta: -10 })?.deltas,
    [{ metric: 'credits_consumed', count: 8 }],
  );
  assert.deepEqual(event('g', 'ai.design.job-queued.v1', {})?.deltas, [
    { metric: 'ai_jobs_total', count: 1 },
  ]);
});

test('rejects malformed envelopes and invalid amounts rather than corrupting aggregates', () => {
  assert.equal(
    mapAnalyticsEvent({
      eventId: 'x',
      eventType: 'paymentsucceeded',
      occurredAt: '2026-09-30T10:00:00Z',
      payload: {},
    }),
    null,
  );
  assert.equal(
    mapAnalyticsEvent({
      eventId: 'x'.repeat(65),
      eventType: 'events.created.v1',
      occurredAt: '2026-09-30T10:00:00Z',
      payload: {},
    }),
    null,
  );
  assert.deepEqual(
    mapAnalyticsEvent({
      eventId: 'ok',
      eventType: 'payment.succeeded.v1',
      occurredAt: '2026-09-30T10:00:00Z',
      payload: { amountMinor: -1, currency: 'CDF', credits: Number.MAX_SAFE_INTEGER + 1 },
    })?.deltas,
    [{ metric: 'payments_succeeded', count: 1 }],
  );
});
