import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventsService } from './events.service.js';

type QueueMessage = { payload?: string; properties?: { headers?: Record<string, unknown> } };
type Envelope = { eventType?: unknown; eventVersion?: unknown; payload?: unknown };

@Injectable()
export class AgencyPaymentConsumer implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private busy = false;
  private timer: NodeJS.Timeout | undefined;
  private readonly api = process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672';
  private readonly username = process.env['RABBITMQ_USER'] ?? 'invitaflow';
  private readonly password = process.env['RABBITMQ_PASSWORD'] ?? '';
  constructor(private readonly events: EventsService) {}
  onModuleInit() { void this.run(); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }

  private async run() {
    if (this.stopped || this.busy) return;
    this.busy = true;
    try { await this.consume(); }
    catch { console.warn(JSON.stringify({ level: 'warn', event: 'agency_payment_event_consume_failed' })); }
    finally { this.busy = false; if (!this.stopped) this.timer = setTimeout(() => void this.run(), 1_000); }
  }

  private async consume() {
    const response = await fetch(`${this.api.replace(/\/$/, '')}/api/queues/%2F/agencies.payment-events/get`, {
      method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ count: 1, ackmode: 'ack_requeue_false', encoding: 'auto', truncate: 250_000 }), signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return;
    const messages: unknown = await response.json();
    if (!Array.isArray(messages)) return;
    for (const message of messages as QueueMessage[]) {
      // Acknowledge-before-processing is paired with explicit retry publishing below.
      if (typeof message.payload !== 'string' || message.payload.length > 250_000) continue;
      let envelope: Envelope;
      try { envelope = JSON.parse(message.payload) as Envelope; } catch { continue; }
      if (envelope.eventType !== 'payment.succeeded.v2' || envelope.eventVersion !== 2 || !envelope.payload || typeof envelope.payload !== 'object') continue;
      const payload = envelope.payload as Record<string, unknown>;
      // The queue can receive future payment types; this handler must never activate them.
      if (payload['orderType'] !== 'AGENCY_SUBSCRIPTION') continue;
      try { await this.events.activateAgencySubscriptionFromPayment(payload); }
      catch {
        const rawAttempts = message.properties?.headers?.['x-invitaflow-retry'];
        const parsed = typeof rawAttempts === 'number' ? rawAttempts : typeof rawAttempts === 'string' && /^\d{1,3}$/.test(rawAttempts) ? Number(rawAttempts) : 0;
        const attempts = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
        await this.republish(message.payload, attempts >= 10 ? 'invitaflow.dlx' : 'amq.default', attempts >= 10 ? 'agencies.payment-events.dead' : 'agencies.payment-events.retry', message.properties?.headers, attempts);
      }
    }
  }

  private async republish(payload: string, exchange: string, routingKey: string, priorHeaders: Record<string, unknown> | undefined, attempts: number) {
    const response = await fetch(`${this.api.replace(/\/$/, '')}/api/exchanges/%2F/${encodeURIComponent(exchange)}/publish`, {
      method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ properties: { delivery_mode: 2, content_type: 'application/json', headers: { ...(priorHeaders ?? {}), 'x-invitaflow-retry': attempts + 1 } }, routing_key: routingKey, payload, payload_encoding: 'string' }), signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error('Agency payment retry publish failed');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || (result as Record<string, unknown>)['routed'] !== true) throw new Error('Agency payment retry event was not routed');
  }
}
