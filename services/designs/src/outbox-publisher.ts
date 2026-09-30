import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

type PendingMessage = { id: string; eventType: string; payload: unknown; createdAt: Date };

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private timer: NodeJS.Timeout | undefined;
  private readonly api = process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672';
  private readonly username = process.env['RABBITMQ_USER'] ?? 'invitaflow';
  private readonly password = process.env['RABBITMQ_PASSWORD'] ?? '';
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() { void this.run(); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }

  private async run() {
    if (this.stopped) return;
    try { await this.publishBatch(); }
    catch { console.warn(JSON.stringify({ level: 'warn', event: 'designs_outbox_delivery_failed' })); }
    if (!this.stopped) this.timer = setTimeout(() => void this.run(), 5_000);
  }

  private async publishBatch() {
    const messages = await this.prisma.outboxMessage.findMany({ where: { publishedAt: null }, orderBy: { createdAt: 'asc' }, take: 25, select: { id: true, eventType: true, payload: true, createdAt: true } }) as PendingMessage[];
    for (const message of messages) {
      const response = await fetch(`${this.api.replace(/\/$/, '')}/api/exchanges/%2F/invitaflow.events/publish`, {
        method: 'POST',
        headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ properties: { delivery_mode: 2, message_id: message.id, content_type: 'application/json', type: message.eventType }, routing_key: message.eventType, payload: JSON.stringify({ eventId: message.id, eventType: message.eventType, eventVersion: 1, occurredAt: message.createdAt.toISOString(), producer: 'designs-service', correlationId: null, causationId: null, payload: message.payload }), payload_encoding: 'string' }),
        signal: AbortSignal.timeout(4_000),
      });
      if (!response.ok) throw new Error('RabbitMQ rejected an outbox message');
      const result: unknown = await response.json();
      if (!result || typeof result !== 'object' || (result as Record<string, unknown>)['routed'] !== true) {
        await this.prisma.outboxMessage.updateMany({ where: { id: message.id, publishedAt: null }, data: { attempts: { increment: 1 } } });
        continue;
      }
      await this.prisma.outboxMessage.updateMany({ where: { id: message.id, publishedAt: null }, data: { publishedAt: new Date(), attempts: { increment: 1 } } });
    }
  }
}
