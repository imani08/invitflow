import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

type Message = { id: string; eventType: string; payload: unknown };

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private timer: NodeJS.Timeout | undefined;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() { void this.run(); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }

  private async run() {
    if (this.stopped) return;
    try { await this.publish(); }
    catch { console.warn(JSON.stringify({ level: 'warn', event: 'access_outbox_delivery_failed' })); }
    if (!this.stopped) this.timer = setTimeout(() => void this.run(), 5_000);
    this.timer?.unref();
  }

  private async publish() {
    const api = process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672';
    const username = process.env['RABBITMQ_USER'] ?? 'invitaflow';
    const password = process.env['RABBITMQ_PASSWORD'] ?? '';
    const pending = await this.prisma.outboxMessage.findMany({ where: { publishedAt: null }, orderBy: { createdAt: 'asc' }, take: 25, select: { id: true, eventType: true, payload: true } }) as Message[];
    for (const message of pending) {
      const response = await fetch(`${api.replace(/\/$/, '')}/api/exchanges/%2F/invitaflow.events/publish`, {
        method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ properties: { delivery_mode: 2, message_id: message.id, content_type: 'application/json', type: message.eventType }, routing_key: message.eventType, payload: JSON.stringify(message.payload), payload_encoding: 'string' }),
        signal: AbortSignal.timeout(4_000),
      });
      if (!response.ok || (await response.json() as { routed?: boolean }).routed !== true) break;
      await this.prisma.outboxMessage.updateMany({ where: { id: message.id, publishedAt: null }, data: { publishedAt: new Date(), attempts: { increment: 1 } } });
    }
  }
}
