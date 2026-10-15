import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CheckInLicenseService } from './checkin-license.service.js';

type Envelope = { eventType?: unknown; eventVersion?: unknown; payload?: unknown };
@Injectable()
export class CheckInLicensePaymentConsumer implements OnModuleInit, OnModuleDestroy {
  private stopped = false; private timer?: ReturnType<typeof setTimeout>; private busy = false;
  private readonly api = process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672';
  private readonly username = process.env['RABBITMQ_USER'] ?? 'invitaflow'; private readonly password = process.env['RABBITMQ_PASSWORD'] ?? '';
  constructor(private readonly licenses: CheckInLicenseService) {}
  onModuleInit() { void this.run(); } onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
  private async run() { if (this.stopped || this.busy) return; this.busy = true; try { await this.consume(); } catch { /* retry on the next poll */ } finally { this.busy = false; if (!this.stopped) this.timer = setTimeout(() => void this.run(), 1_000); } }
  private async consume() {
    const response = await fetch(`${this.api.replace(/\/$/, '')}/api/queues/%2F/access.payment-events/get`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' }, body: JSON.stringify({ count: 1, ackmode: 'ack_requeue_true', encoding: 'auto', truncate: 250_000 }), signal: AbortSignal.timeout(4_000) });
    if (!response.ok) return; const messages: unknown = await response.json(); if (!Array.isArray(messages)) return;
    for (const message of messages as Array<{ payload?: unknown }>) {
      if (typeof message.payload !== 'string') continue; let envelope: Envelope; try { envelope = JSON.parse(message.payload) as Envelope; } catch { continue; }
      if (envelope.eventType !== 'payment.succeeded.v2' || envelope.eventVersion !== 2 || !envelope.payload || typeof envelope.payload !== 'object') continue;
      const p = envelope.payload as Record<string, unknown>;
      if (p['orderType'] !== 'CREDIT_PURCHASE' || typeof p['ownerSubject'] !== 'string' || typeof p['paymentId'] !== 'string' || !Number.isSafeInteger(p['checkInEvents']) || !Number.isSafeInteger(p['checkInGuestCapacity'])) continue;
      await this.licenses.createPersonalLicenses(p['ownerSubject'], p['paymentId'], p['checkInEvents'] as number, p['checkInGuestCapacity'] as number);
    }
  }
}
