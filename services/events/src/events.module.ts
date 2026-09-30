import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PrismaService } from './prisma.service.js';

@Module({ controllers: [HealthController, EventsController], providers: [PrismaService, IdentityGuard, EventsService, OutboxPublisher] })
export class EventsModule {}
