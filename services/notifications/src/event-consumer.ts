import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';

type QueueMessage = { payload?: string; properties?: { headers?: Record<string, unknown>; message_id?: string; type?: string } };
type EventEnvelope = { eventId?: unknown; eventType?: unknown; payload?: unknown };

@Injectable()
export class EventConsumer implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private busy = false;
  private timer: NodeJS.Timeout | undefined;
  private readonly api = (process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672').replace(/\/$/, '');
  private readonly username = process.env['RABBITMQ_USER'] ?? 'invitaflow';
  private readonly password = process.env['RABBITMQ_PASSWORD'] ?? '';
  constructor(private readonly notifications: NotificationsService) {}

  onModuleInit() { void this.run(); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }

  private async run() {
    if (this.stopped || this.busy) return;
    this.busy = true;
    try { await this.consumeOne(); }
    catch { console.warn(JSON.stringify({ level: 'warn', event: 'notifications_event_consume_failed' })); }
    finally { this.busy = false; if (!this.stopped) this.timer = setTimeout(() => void this.run(), 1_000); }
  }

  private async consumeOne() {
    const response = await fetch(`${this.api}/api/queues/%2F/notifications.events/get`, {
      method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ count: 1, ackmode: 'ack_requeue_false', encoding: 'auto', truncate: 250_000 }), signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return;
    const messages: unknown = await response.json();
    if (!Array.isArray(messages) || messages.length === 0) return;
    const message = messages[0] as QueueMessage;
    if (typeof message.payload !== 'string' || message.payload.length > 250_000) return;
    let envelope: EventEnvelope;
    try {
      const parsed = JSON.parse(message.payload) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      const record = parsed as Record<string, unknown>;
      envelope = typeof record['eventType'] === 'string' ? record as EventEnvelope : { eventType: message.properties?.type, payload: record };
    } catch { return; }
    const rawId = typeof envelope.eventId === 'string' ? envelope.eventId : message.properties?.message_id;
    const sourceEventId = typeof rawId === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(rawId) ? rawId : this.notifications.sourceFallback(message.payload);
    try { await this.notifications.consume(sourceEventId, envelope); }
    catch {
      const rawAttempts = message.properties?.headers?.['x-invitaflow-retry'];
      const numericAttempts = typeof rawAttempts === 'number' ? rawAttempts : typeof rawAttempts === 'string' && /^\d{1,2}$/.test(rawAttempts) ? Number(rawAttempts) : 0;
      const attempts = Number.isSafeInteger(numericAttempts) && numericAttempts >= 0 ? numericAttempts : 0;
      if (attempts >= 10) await this.republish(message.payload, 'invitaflow.dlx', 'notifications.events.dead', message.properties, attempts + 1);
      else await this.republish(message.payload, 'amq.default', 'notifications.events.retry', message.properties, attempts + 1);
    }
  }

  private async republish(payload: string, exchange: string, routingKey: string, priorProperties: QueueMessage['properties'], attempts: number) {
    const response = await fetch(`${this.api}/api/exchanges/%2F/${encodeURIComponent(exchange)}/publish`, {
      method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ properties: { delivery_mode: 2, content_type: 'application/json', ...(priorProperties?.message_id ? { message_id: priorProperties.message_id } : {}), ...(priorProperties?.type ? { type: priorProperties.type } : {}), headers: { ...(priorProperties?.headers ?? {}), 'x-invitaflow-retry': attempts } }, routing_key: routingKey, payload, payload_encoding: 'string' }), signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error('RabbitMQ retry publish failed');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || (result as Record<string, unknown>)['routed'] !== true) throw new Error('RabbitMQ retry event was not routed');
  }
}
