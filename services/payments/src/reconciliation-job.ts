import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

@Injectable()
export class ReconciliationJob implements OnModuleInit, OnModuleDestroy {
  private stopped = false;
  private busy = false;
  private timer: NodeJS.Timeout | undefined;
  constructor(private readonly payments: PaymentsService) {}
  onModuleInit() { this.timer = setTimeout(() => void this.run(), 20_000); }
  onModuleDestroy() { this.stopped = true; if (this.timer) clearTimeout(this.timer); }
  private async run() {
    if (this.stopped || this.busy) return;
    this.busy = true;
    try { await this.payments.reconcile(); }
    catch { console.warn(JSON.stringify({ level: 'warn', event: 'payment_reconciliation_failed' })); }
    finally { this.busy = false; if (!this.stopped) this.timer = setTimeout(() => void this.run(), 60_000); }
  }
}
