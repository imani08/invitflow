import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import type { AnalyticsEvent } from './metrics.js';
import { mapAnalyticsEvent } from './metrics.js';

const maxMessageBytes = 250_000;
const maxRetryAttempts = 10;

type RetryPublisher = (message: ConsumeMessage, attempt: number) => Promise<void>;
type AnalyticsConsumer = { consume(event: AnalyticsEvent): Promise<unknown> };
type Envelope = { eventId?: unknown; eventType?: unknown; occurredAt?: unknown; payload?: unknown };

export async function processAnalyticsDelivery(
  channel: Pick<ConfirmChannel, 'ack' | 'nack'>,
  message: ConsumeMessage,
  analytics: AnalyticsConsumer,
  publishRetry: RetryPublisher,
) {
  const event = parseAnalyticsEvent(message);
  if (!event || !mapAnalyticsEvent(event)) {
    channel.nack(message, false, false);
    return;
  }

  try {
    await analytics.consume(event);
  } catch {
    try {
      await publishRetry(message, retryAttempt(message) + 1);
    } catch {
      channel.nack(message, false, true);
      return;
    }
  }

  channel.ack(message);
}

export function parseAnalyticsEvent(message: ConsumeMessage): AnalyticsEvent | null {
  if (message.content.byteLength === 0 || message.content.byteLength > maxMessageBytes) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(message.content.toString('utf8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const record = parsed as Record<string, unknown>;
  const envelope: Envelope =
    typeof record['eventType'] === 'string'
      ? (record as Envelope)
      : {
          eventType: message.properties.type,
          occurredAt: record['occurredAt'],
          payload: record,
        };
  const eventId =
    typeof envelope.eventId === 'string' ? envelope.eventId : message.properties.messageId;
  if (
    typeof eventId !== 'string' ||
    typeof envelope.eventType !== 'string' ||
    typeof envelope.occurredAt !== 'string' ||
    !envelope.payload ||
    typeof envelope.payload !== 'object' ||
    Array.isArray(envelope.payload)
  )
    return null;

  return {
    eventId,
    eventType: envelope.eventType,
    occurredAt: envelope.occurredAt,
    payload: envelope.payload,
  };
}

export function createAmqpRetryPublisher(channel: ConfirmChannel): RetryPublisher {
  return async (message, attempt) => {
    const toDeadLetter = attempt > maxRetryAttempts;
    const correlationId = randomUUID();
    let returned = false;
    const onReturn = (returnedMessage: ConsumeMessage) => {
      if (returnedMessage.properties.correlationId === correlationId) returned = true;
    };
    channel.on('return', onReturn);
    try {
      await new Promise<void>((resolve, reject) => {
        const options = {
          persistent: true,
          mandatory: true,
          contentType: message.properties.contentType ?? 'application/json',
          ...(typeof message.properties.messageId === 'string'
            ? { messageId: message.properties.messageId }
            : {}),
          ...(typeof message.properties.type === 'string' ? { type: message.properties.type } : {}),
          headers: { ...message.properties.headers, 'x-invitaflow-retry': attempt },
          correlationId,
        };
        const confirmed = (error: Error | null) => (error ? reject(error) : resolve());
        if (toDeadLetter)
          channel.publish(
            'invitaflow.dlx',
            'analytics.events.dead',
            message.content,
            options,
            confirmed,
          );
        else channel.sendToQueue('analytics.events.retry', message.content, options, confirmed);
      });
      if (returned) throw new Error('RabbitMQ retry event was not routed');
    } finally {
      channel.off('return', onReturn);
    }
  };
}

function retryAttempt(message: ConsumeMessage) {
  const raw = message.properties.headers?.['x-invitaflow-retry'];
  if (typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0) return raw;
  if (typeof raw === 'string' && /^\d{1,2}$/.test(raw)) return Number(raw);
  return 0;
}
