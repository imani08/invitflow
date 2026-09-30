import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuditService } from './audit.service.js';

type QueueMessage = { payload?: string; properties?: { headers?: Record<string, unknown>; message_id?: string; type?: string } };
type Envelope = { eventId?: unknown; eventType?: unknown; occurredAt?: unknown; payload?: unknown };

@Injectable()
export class EventConsumer implements OnModuleInit, OnModuleDestroy {
  private stopped = false; private busy = false; private timer: NodeJS.Timeout | undefined;
  private readonly api = (process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672').replace(/\/$/, '');
  private readonly username = process.env['RABBITMQ_USER'] ?? 'invitaflow'; private readonly password = process.env['RABBITMQ_PASSWORD'] ?? '';
  constructor(private readonly audit: AuditService) {}
  onModuleInit() { void this.run(); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
  private async run() { if (this.stopped || this.busy) return; this.busy = true; try { await this.consumeOne(); } catch { console.warn(JSON.stringify({ level: 'warn', event: 'audit_event_consume_failed' })); } finally { this.busy = false; if (!this.stopped) this.timer = setTimeout(() => void this.run(), 1000); } }

  private async consumeOne() {
    const response = await fetch(`${this.api}/api/queues/%2F/audit.events/get`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' }, body: JSON.stringify({ count: 1, ackmode: 'ack_requeue_false', encoding: 'auto', truncate: 250_000 }), signal: AbortSignal.timeout(4000) });
    if (!response.ok) return; const messages: unknown = await response.json(); if (!Array.isArray(messages) || !messages.length) return; const message = messages[0] as QueueMessage;
    if (typeof message.payload !== 'string' || message.payload.length > 250_000) return;
    try {
      const value: unknown = JSON.parse(message.payload); if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      const raw = value as Envelope; const envelope = typeof raw.eventType === 'string' ? raw : { eventType: message.properties?.type, payload: value };
      const rawId = typeof envelope.eventId === 'string' ? envelope.eventId : message.properties?.message_id; const id = typeof rawId === 'string' && /^[A-Za-z0-9._:-]{1,64}$/.test(rawId) ? rawId : this.audit.sourceFallback(message.payload);
      await this.audit.record(id, envelope as Envelope);
    } catch {
      const rawAttempts = message.properties?.headers?.['x-invitaflow-retry']; const parsed = typeof rawAttempts === 'number' ? rawAttempts : typeof rawAttempts === 'string' && /^\d{1,2}$/.test(rawAttempts) ? Number(rawAttempts) : 0; const attempts = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
      if (attempts >= 10) await this.republish(message, 'invitaflow.dlx', 'audit.events.dead', attempts + 1);
      else await this.republish(message, 'amq.default', 'audit.events.retry', attempts + 1);
    }
  }

  private async republish(message: QueueMessage, exchange: string, routingKey: string, attempts: number) {
    const response = await fetch(`${this.api}/api/exchanges/%2F/${encodeURIComponent(exchange)}/publish`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' }, body: JSON.stringify({ properties: { delivery_mode: 2, content_type: 'application/json', ...(message.properties?.message_id ? { message_id: message.properties.message_id } : {}), ...(message.properties?.type ? { type: message.properties.type } : {}), headers: { ...(message.properties?.headers ?? {}), 'x-invitaflow-retry': attempts } }, routing_key: routingKey, payload: message.payload, payload_encoding: 'string' }), signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error('Audit event retry publish failed'); const result: unknown = await response.json(); if (!result || typeof result !== 'object' || (result as Record<string, unknown>)['routed'] !== true) throw new Error('Audit event retry was not routed');
  }
}
