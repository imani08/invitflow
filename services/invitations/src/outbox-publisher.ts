import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private stopped = false; private timer: NodeJS.Timeout | undefined;
  private readonly api = process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672';
  private readonly user = process.env['RABBITMQ_USER'] ?? 'invitaflow'; private readonly password = process.env['RABBITMQ_PASSWORD'] ?? '';
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() { if (process.env['INVITATION_OUTBOX_ENABLED'] === 'true') void this.run(); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
  private async run() { if (this.stopped) return; try { await this.publish(); } catch { console.warn(JSON.stringify({ level: 'warn', event: 'invitation_outbox_delivery_failed' })); } if (!this.stopped) this.timer = setTimeout(() => void this.run(), 2000); }
  private async publish() {
    const messages = await this.prisma.outboxMessage.findMany({ where: { publishedAt: null }, orderBy: { createdAt: 'asc' }, take: 20 });
    for (const message of messages) {
      const isRender = message.eventType === 'invitation.render.requested.v1';
      const exchange = isRender ? 'invitaflow.render.jobs' : 'invitaflow.events';
      const routingKey = isRender ? 'render.requested' : message.eventType;
      const response = await fetch(`${this.api.replace(/\/$/, '')}/api/exchanges/%2F/${exchange}/publish`, { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${this.user}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' }, body: JSON.stringify({ properties: { delivery_mode: 2, message_id: message.id, content_type: 'application/json', type: message.eventType }, routing_key: routingKey, payload: JSON.stringify({ eventId: message.id, eventType: message.eventType, eventVersion: 1, occurredAt: message.createdAt.toISOString(), producer: 'invitations-service', correlationId: null, causationId: null, payload: message.payload }), payload_encoding: 'string' }), signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error('RabbitMQ rejected invitation outbox message'); const result: unknown = await response.json();
      if (result && typeof result === 'object' && (result as Record<string, unknown>)['routed'] === true) await this.prisma.outboxMessage.updateMany({ where: { id: message.id, publishedAt: null }, data: { publishedAt: new Date(), attempts: { increment: 1 } } });
      else await this.prisma.outboxMessage.updateMany({ where: { id: message.id, publishedAt: null }, data: { attempts: { increment: 1 } } });
    }
  }
}
