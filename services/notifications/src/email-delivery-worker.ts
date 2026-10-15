import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EmailSender } from './email-sender.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class EmailDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private busy = false;
  constructor(private readonly prisma: PrismaService, private readonly sender: EmailSender) {}
  onModuleInit() { void this.work(); this.timer = setInterval(() => void this.work(), 3_000); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  private async work() {
    if (this.busy) return;
    this.busy = true;
    try {
      const rows = await this.prisma.emailDelivery.findMany({ where: { sentAt: null, attempts: { lt: 10 }, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - 5 * 60_000) } }] }, orderBy: { createdAt: 'asc' }, take: 10 });
      for (const row of rows) {
        const claimed = await this.prisma.emailDelivery.updateMany({ where: { id: row.id, sentAt: null, OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(Date.now() - 5 * 60_000) } }] }, data: { claimedAt: new Date(), attempts: { increment: 1 } } });
        if (!claimed.count) continue;
        try { await this.sender.send(row.recipientEmail, row.subject, row.text); await this.prisma.emailDelivery.update({ where: { id: row.id }, data: { sentAt: new Date(), claimedAt: null } }); }
        catch { await this.prisma.emailDelivery.update({ where: { id: row.id }, data: { claimedAt: null } }); }
      }
    } finally { this.busy = false; }
  }
}
