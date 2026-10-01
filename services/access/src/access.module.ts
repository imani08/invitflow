import { Module } from '@nestjs/common';
import { AccessController } from './access.controller.js';
import { EventsClient } from './events-client.js';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { PrismaService } from './prisma.service.js';
import { AccessService } from './access.service.js';
import { OutboxPublisher } from './outbox-publisher.js';

@Module({ controllers: [AccessController, HealthController], providers: [AccessService, EventsClient, IdentityGuard, PrismaService, OutboxPublisher] })
export class AccessModule {}
