import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private timer?: NodeJS.Timeout;
  private readonly api = process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672';
  private readonly user = process.env['RABBITMQ_USER'] ?? 'invitaflow';
  private readonly password = process.env['RABBITMQ_PASSWORD'] ?? '';
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() { void this.run(); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
  private async run() {
    if (this.stopped) return;
    try {
      const rows = await this.prisma.outboxMessage.findMany({ where: { publishedAt: null }, orderBy: { createdAt: 'asc' }, take: 20 });
      for (const row of rows) {
        const response = await fetch(`${this.api.replace(/\/$/, '')}/api/exchanges/%2F/invitaflow.events/publish`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.user}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' }, body: JSON.stringify({ properties: { delivery_mode: 2, message_id: row.id, content_type: 'application/json', type: row.eventType }, routing_key: row.eventType, payload: JSON.stringify({ eventId: row.id, eventType: row.eventType, eventVersion: 1, occurredAt: row.createdAt.toISOString(), producer: 'media-service', correlationId: null, causationId: null, payload: row.payload }), payload_encoding: 'string' }), signal: AbortSignal.timeout(4000) });
        const result = response.ok ? await response.json() as { routed?: boolean } : {};
        await this.prisma.outboxMessage.updateMany({ where: { id: row.id, publishedAt: null }, data: { publishedAt: result.routed ? new Date() : null, attempts: { increment: 1 } } });
      }
    } catch { console.warn(JSON.stringify({ level: 'warn', event: 'media_outbox_delivery_failed' })); }
    if (!this.stopped) this.timer = setTimeout(() => void this.run(), 3000);
  }
}
