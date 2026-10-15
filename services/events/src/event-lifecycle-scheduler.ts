import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventsService } from './events.service.js';

@Injectable()
export class EventLifecycleScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(private readonly events: EventsService) {}

  onModuleInit() {
    void this.completeDueEvents();
    this.timer = setInterval(() => void this.completeDueEvents(), 15 * 60 * 1000);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async completeDueEvents() {
    if (this.running) return;
    this.running = true;
    try {
      await this.events.completeDueEvents();
    } catch {
      console.warn(JSON.stringify({ level: 'warn', event: 'event_auto_completion_failed' }));
    } finally {
      this.running = false;
    }
  }
}
