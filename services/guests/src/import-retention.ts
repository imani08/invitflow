import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ImportStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class ImportRetention implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.cleanExpired();
    this.timer = setInterval(() => void this.cleanExpired(), 60 * 60 * 1000);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async cleanExpired() {
    if (this.running) return;
    this.running = true;
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const expired = await this.prisma.importJob.findMany({
        where: { status: { in: [ImportStatus.ANALYZED, ImportStatus.MAPPED] }, createdAt: { lt: cutoff } },
        orderBy: { createdAt: 'asc' }, take: 100,
        select: { id: true, ownerSubject: true, eventId: true },
      });
      for (const job of expired) {
        await this.prisma.$transaction(async (tx) => {
          const result = await tx.importJob.updateMany({
            where: { id: job.id, status: { in: [ImportStatus.ANALYZED, ImportStatus.MAPPED] } },
            data: { status: ImportStatus.FAILED, sourceRows: Prisma.JsonNull, mapping: Prisma.DbNull, preview: Prisma.DbNull },
          });
          if (result.count) await tx.outboxMessage.create({ data: {
            eventType: 'guest.import.expired.v1', aggregateId: job.id,
            payload: { importJobId: job.id, eventId: job.eventId, ownerSubject: job.ownerSubject, occurredAt: new Date().toISOString(), schemaVersion: 1 },
          } });
        });
      }
    } catch {
      console.warn(JSON.stringify({ level: 'warn', event: 'guest_import_retention_failed' }));
    } finally {
      this.running = false;
    }
  }
}
