import { Module } from '@nestjs/common';
import { DesignsController } from './designs.controller.js';
import { DesignsService } from './designs.service.js';
import { EventsClient } from './events-client.js';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PrismaService } from './prisma.service.js';
import { StorageMonitorGuard, StorageReferenceController } from './storage-reference.controller.js';

@Module({ controllers: [HealthController, DesignsController, StorageReferenceController], providers: [PrismaService, IdentityGuard, StorageMonitorGuard, EventsClient, DesignsService, OutboxPublisher] })
export class DesignsModule {}
