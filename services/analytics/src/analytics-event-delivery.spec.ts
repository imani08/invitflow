import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import {
  createAmqpRetryPublisher,
  parseAnalyticsEvent,
  processAnalyticsDelivery,
} from './analytics-event-delivery.js';

function delivery(body: unknown, properties: Record<string, unknown> = {}) {
  return {
    content: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
    fields: { deliveryTag: 1, redelivered: false, exchange: '', routingKey: 'analytics.events' },
    properties: { headers: {}, ...properties },
  } as unknown as ConsumeMessage;
}

function fakeChannel() {
  const acknowledged: ConsumeMessage[] = [];
  const rejected: Array<{ message: ConsumeMessage; requeue: boolean }> = [];
  const channel = {
    ack(message: ConsumeMessage) {
      acknowledged.push(message);
    },
    nack(message: ConsumeMessage, _allUpTo: boolean, requeue: boolean) {
      rejected.push({ message, requeue });
    },
  } as unknown as ConfirmChannel;
  return { channel, acknowledged, rejected };
}

const validEvent = {
  eventId: 'payment-1',
  eventType: 'payment.succeeded.v1',
  occurredAt: '2026-10-01T10:00:00Z',
  payload: { credits: 5, amountMinor: 1200, currency: 'CDF' },
};

test('parses current event envelopes and the legacy property-type envelope', () => {
  assert.deepEqual(parseAnalyticsEvent(delivery(validEvent)), validEvent);
  assert.deepEqual(
    parseAnalyticsEvent(
      delivery(
        { occurredAt: validEvent.occurredAt, paymentId: 'payment-1' },
        {
          messageId: 'payment-event-1',
          type: validEvent.eventType,
        },
      ),
    ),
    {
      eventId: 'payment-event-1',
      eventType: validEvent.eventType,
      occurredAt: validEvent.occurredAt,
      payload: { occurredAt: validEvent.occurredAt, paymentId: 'payment-1' },
    },
  );
});

test('acknowledges only after the Analytics database transaction resolves', async () => {
  const message = delivery(validEvent);
  const { channel, acknowledged, rejected } = fakeChannel();
  let committed = false;
  await processAnalyticsDelivery(
    channel,
    message,
    {
      async consume() {
        committed = true;
        return { processed: true };
      },
    },
    async () => assert.fail('a successful consume must not publish a retry'),
  );

  assert.equal(committed, true);
  assert.deepEqual(acknowledged, [message]);
  assert.deepEqual(rejected, []);
});

test('publishes a failed event to retry before acknowledging and increments its attempt header', async () => {
  const message = delivery(validEvent, { headers: { 'x-invitaflow-retry': 2 } });
  const { channel, acknowledged, rejected } = fakeChannel();
  let published = false;
  await processAnalyticsDelivery(
    channel,
    message,
    {
      async consume() {
        throw new Error('database unavailable');
      },
    },
    async (_message, attempt) => {
      assert.equal(attempt, 3);
      published = true;
    },
  );

  assert.equal(published, true);
  assert.deepEqual(acknowledged, [message]);
  assert.deepEqual(rejected, []);
});

test('requeues a failed event when retry publication cannot be confirmed', async () => {
  const message = delivery(validEvent);
  const { channel, acknowledged, rejected } = fakeChannel();
  await processAnalyticsDelivery(
    channel,
    message,
    {
      async consume() {
        throw new Error('database unavailable');
      },
    },
    async () => {
      throw new Error('broker unavailable');
    },
  );

  assert.deepEqual(acknowledged, []);
  assert.deepEqual(rejected, [{ message, requeue: true }]);
});

test('dead-letters invalid and oversized messages without passing them to Analytics', async () => {
  for (const message of [
    delivery('{malformed'),
    delivery(Buffer.alloc(250_001).toString('utf8')),
    delivery({ ...validEvent, eventType: 'malformed' }),
  ]) {
    const { channel, acknowledged, rejected } = fakeChannel();
    let called = false;
    await processAnalyticsDelivery(
      channel,
      message,
      {
        async consume() {
          called = true;
        },
      },
      async () => assert.fail('invalid messages must go to the configured dead-letter route'),
    );
    assert.equal(called, false);
    assert.deepEqual(acknowledged, []);
    assert.deepEqual(rejected, [{ message, requeue: false }]);
  }
});

test('confirms durable AMQP retry and dead-letter publications', async () => {
  const operations: Array<{
    kind: string;
    name: string;
    content: Buffer;
    options: Record<string, unknown>;
  }> = [];
  const broker = new EventEmitter();
  const channel = Object.assign(broker, {
    sendToQueue(
      name: string,
      content: Buffer,
      options: Record<string, unknown>,
      callback: (error: Error | null) => void,
    ) {
      operations.push({ kind: 'queue', name, content, options });
      callback(null);
      return true;
    },
    publish(
      name: string,
      routingKey: string,
      content: Buffer,
      options: Record<string, unknown>,
      callback: (error: Error | null) => void,
    ) {
      operations.push({ kind: 'exchange', name: `${name}:${routingKey}`, content, options });
      callback(null);
      return true;
    },
  }) as unknown as ConfirmChannel;
  const publish = createAmqpRetryPublisher(channel);
  const message = delivery(validEvent, { messageId: 'payment-1', type: validEvent.eventType });

  await publish(message, 1);
  await publish(message, 11);

  assert.equal(operations[0]?.kind, 'queue');
  assert.equal(operations[0]?.name, 'analytics.events.retry');
  assert.equal(operations[0]?.options['persistent'], true);
  assert.equal(operations[0]?.options['mandatory'], true);
  assert.equal(
    (operations[0]?.options['headers'] as Record<string, unknown>)['x-invitaflow-retry'],
    1,
  );
  assert.equal(operations[0]?.content.toString(), JSON.stringify(validEvent));
  assert.deepEqual(operations[1]?.name, 'invitaflow.dlx:analytics.events.dead');
  assert.equal(
    (operations[1]?.options['headers'] as Record<string, unknown>)['x-invitaflow-retry'],
    11,
  );
});

test('rejects an AMQP retry publication returned as unroutable', async () => {
  const broker = new EventEmitter();
  const channel = Object.assign(broker, {
    sendToQueue(
      _name: string,
      content: Buffer,
      options: Record<string, unknown>,
      callback: (error: Error | null) => void,
    ) {
      broker.emit('return', { content, properties: { correlationId: options['correlationId'] } });
      callback(null);
      return true;
    },
  }) as unknown as ConfirmChannel;
  const publish = createAmqpRetryPublisher(channel);
  await assert.rejects(publish(delivery(validEvent), 1), /not routed/);
});
