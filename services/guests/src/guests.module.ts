import { Module } from '@nestjs/common';
import { EventsClient } from './events-client.js';
import { GuestImportsController, GuestsController } from './guests.controller.js';
import { GuestsService } from './guests.service.js';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { ImportRetention } from './import-retention.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PrismaService } from './prisma.service.js';

@Module({ controllers: [HealthController, GuestsController, GuestImportsController], providers: [PrismaService, IdentityGuard, EventsClient, GuestsService, OutboxPublisher, ImportRetention] })
export class GuestsModule {}
