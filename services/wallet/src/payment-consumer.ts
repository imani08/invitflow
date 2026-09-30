import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WalletService } from './wallet.service.js';

type QueueMessage = { payload?: string; properties?: { headers?: Record<string, unknown> } };
type Envelope = { eventType?: unknown; payload?: unknown };

@Injectable()
export class PaymentConsumer implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private timer: NodeJS.Timeout | undefined;
  private busy = false;
  private readonly api = process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672';
  private readonly username = process.env['RABBITMQ_USER'] ?? 'invitaflow';
  private readonly password = process.env['RABBITMQ_PASSWORD'] ?? '';
  constructor(private readonly wallet: WalletService) {}
  onModuleInit() { void this.run(); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }

  private async run() {
    if (this.stopped || this.busy) return;
    this.busy = true;
    try { await this.consume(); }
    catch { console.warn(JSON.stringify({ level: 'warn', event: 'wallet_payment_event_consume_failed' })); }
    finally { this.busy = false; if (!this.stopped) this.timer = setTimeout(() => void this.run(), 1_000); }
  }

  private async consume() {
    const response = await fetch(`${this.api.replace(/\/$/, '')}/api/queues/%2F/wallet.payment-events/get`, {
      method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ count: 1, ackmode: 'ack_requeue_false', encoding: 'auto', truncate: 250_000 }), signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return;
    const messages: unknown = await response.json();
    if (!Array.isArray(messages)) return;
    for (const message of messages as QueueMessage[]) {
      // RabbitMQ's management API acknowledges the fetched message before application processing.
      if (typeof message.payload !== 'string' || message.payload.length > 250_000) continue;
      let envelope: Envelope;
      try { envelope = JSON.parse(message.payload) as Envelope; } catch { continue; }
      if (!['payment.succeeded.v1', 'payment.refunded.v1'].includes(String(envelope.eventType)) || !envelope.payload || typeof envelope.payload !== 'object') continue;
      const payload = envelope.payload as Record<string, unknown>;
      const paymentId = payload['paymentId']; const ownerSubject = payload['ownerSubject']; const credits = payload['credits'];
      if (typeof paymentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(paymentId) || typeof ownerSubject !== 'string' || ownerSubject.length > 255 || !Number.isSafeInteger(credits) || (credits as number) < 1) continue;
      try {
        if (envelope.eventType === 'payment.succeeded.v1') await this.wallet.credit(ownerSubject, `payment:${paymentId}:purchase`, { type: 'PURCHASE', referenceId: paymentId, credits });
        else await this.wallet.reversePurchase(ownerSubject, paymentId, `payment:${paymentId}:refund`);
      } catch {
        const rawAttempts = message.properties?.headers?.['x-invitaflow-retry'];
        const parsedAttempts = typeof rawAttempts === 'number' ? rawAttempts : typeof rawAttempts === 'string' && /^\d{1,3}$/.test(rawAttempts) ? Number(rawAttempts) : 0;
        const attempts = Number.isSafeInteger(parsedAttempts) && parsedAttempts >= 0 ? parsedAttempts : 0;
        const isRefund = envelope.eventType === 'payment.refunded.v1';
        if (attempts >= 10) await this.republish(message.payload, 'invitaflow.dlx', 'wallet.payment-events.dead', message.properties?.headers);
        else await this.republish(message.payload, 'amq.default', isRefund ? 'wallet.payment-refunds.retry' : 'wallet.payment-events.retry', message.properties?.headers);
      }
    }
  }

  private async republish(payload: string, exchange: string, routingKey: string, priorHeaders?: Record<string, unknown>) {
    const rawAttempts = priorHeaders?.['x-invitaflow-retry'];
    const parsedAttempts = typeof rawAttempts === 'number' ? rawAttempts : typeof rawAttempts === 'string' && /^\d{1,3}$/.test(rawAttempts) ? Number(rawAttempts) : 0;
    const attempts = Number.isSafeInteger(parsedAttempts) && parsedAttempts >= 0 ? parsedAttempts : 0;
    const response = await fetch(`${this.api.replace(/\/$/, '')}/api/exchanges/%2F/${encodeURIComponent(exchange)}/publish`, {
      method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ properties: { delivery_mode: 2, content_type: 'application/json', headers: { ...(priorHeaders ?? {}), 'x-invitaflow-retry': attempts + 1 } }, routing_key: routingKey, payload, payload_encoding: 'string' }), signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) throw new Error('RabbitMQ retry publish failed');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || (result as Record<string, unknown>)['routed'] !== true) throw new Error('RabbitMQ retry event was not routed');
  }
}
