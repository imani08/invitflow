import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiDesignJobStatus } from '../generated/prisma/client.js';
import { AiDesignService } from './ai-design.service.js';
import { PreviewStorage } from './preview-storage.js';
import { PrismaService } from './prisma.service.js';

type QueueMessage = { payload?: string };

@Injectable()
export class Worker implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private timer: NodeJS.Timeout | undefined;
  private queueBusy = false;
  private sweepBusy = false;
  private readonly api = process.env['RABBITMQ_MANAGEMENT_URL'] ?? 'http://rabbitmq:15672';
  private readonly username = process.env['RABBITMQ_USER'] ?? 'invitaflow';
  private readonly password = process.env['RABBITMQ_PASSWORD'] ?? '';

  constructor(private readonly prisma: PrismaService, private readonly designs: AiDesignService, private readonly previews: PreviewStorage) {}
  onModuleInit() { void this.run(); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }

  private async run() {
    if (this.stopped) return;
    await Promise.all([this.consume(), this.sweep()]);
    if (!this.stopped) this.timer = setTimeout(() => void this.run(), 1_000);
  }

  private async consume() {
    if (this.queueBusy) return;
    this.queueBusy = true;
    try {
      const response = await fetch(`${this.api.replace(/\/$/, '')}/api/queues/%2F/ai-design.jobs/get`, {
        method: 'POST',
        headers: { authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ count: 5, ackmode: 'ack_requeue_false', encoding: 'auto', truncate: 250_000 }),
        signal: AbortSignal.timeout(3_000),
      });
      if (!response.ok) return;
      const messages: unknown = await response.json();
      if (!Array.isArray(messages)) return;
      for (const message of messages as QueueMessage[]) {
        if (typeof message.payload !== 'string' || message.payload.length > 250_000) continue;
        let envelope: unknown;
        try { envelope = JSON.parse(message.payload); } catch { continue; }
        if (!envelope || typeof envelope !== 'object' || !('payload' in envelope)) continue;
        const payload = (envelope as { payload?: unknown }).payload;
        if (!payload || typeof payload !== 'object' || !('jobId' in payload)) continue;
        const jobId = (payload as { jobId?: unknown }).jobId;
        if (typeof jobId === 'string') await this.designs.process(jobId);
      }
    } catch { /* The database lease sweeper republishes missed jobs. */ }
    finally { this.queueBusy = false; }
  }

  private async sweep() {
    if (this.sweepBusy) return;
    this.sweepBusy = true;
    try {
      const now = new Date();
      const expired = await this.prisma.aiDesignJob.findMany({ where: { status: AiDesignJobStatus.PROCESSING, startedAt: { lt: new Date(now.getTime() - 5 * 60_000) } }, take: 25, select: { id: true, eventId: true, designId: true, attempt: true, startedAt: true } });
      for (const job of expired) {
        if (job.attempt >= 3) {
          await this.prisma.$transaction(async (tx) => {
            const updated = await tx.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt: job.startedAt }, data: { status: AiDesignJobStatus.FAILED, errorCode: 'worker_timeout', completedAt: now } });
            if (updated.count) await tx.outboxMessage.create({ data: { eventType: 'ai.design.job-failed.v1', aggregateId: job.id, payload: { jobId: job.id, eventId: job.eventId, designId: job.designId, errorCode: 'worker_timeout' } } });
          });
          continue;
        }
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt: job.startedAt }, data: { status: AiDesignJobStatus.QUEUED, startedAt: null, deliveryAfter: now, errorCode: null } });
          if (updated.count) await tx.outboxMessage.create({ data: { eventType: 'ai.design.requested.v1', aggregateId: job.id, payload: { jobId: job.id, eventId: job.eventId, designId: job.designId } } });
        });
      }

      const stranded = await this.prisma.aiDesignJob.findMany({ where: { status: AiDesignJobStatus.QUEUED, deliveryAfter: { lt: new Date(now.getTime() - 10_000) } }, orderBy: { deliveryAfter: 'asc' }, take: 10, select: { id: true, eventId: true, designId: true } });
      for (const job of stranded) {
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.QUEUED, deliveryAfter: { lt: new Date(now.getTime() - 10_000) } }, data: { deliveryAfter: new Date(now.getTime() + 30_000) } });
          if (updated.count) await tx.outboxMessage.create({ data: { eventType: 'ai.design.requested.v1', aggregateId: job.id, payload: { jobId: job.id, eventId: job.eventId, designId: job.designId } } });
        });
      }

      const expiredJobs = await this.prisma.aiDesignJob.findMany({ where: { status: { in: [AiDesignJobStatus.PROPOSED, AiDesignJobStatus.FAILED, AiDesignJobStatus.CANCELLED] }, completedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60_000) } }, take: 50, select: { id: true, previewObjectKey: true } });
      for (const job of expiredJobs) {
        if (job.previewObjectKey) await this.previews.delete(job.previewObjectKey);
        await this.prisma.aiDesignJob.deleteMany({ where: { id: job.id, status: { in: [AiDesignJobStatus.PROPOSED, AiDesignJobStatus.FAILED, AiDesignJobStatus.CANCELLED] } } });
      }
      await this.prisma.outboxMessage.deleteMany({ where: { publishedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60_000) } } });
    } catch { console.warn(JSON.stringify({ level: 'warn', event: 'ai_design_worker_sweep_failed' })); }
    finally { this.sweepBusy = false; }
  }
}
