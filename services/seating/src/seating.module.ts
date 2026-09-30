import { Module } from '@nestjs/common';
import { EventsClient } from './events-client.js';
import { GuestsClient } from './guests-client.js';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PrismaService } from './prisma.service.js';
import { SeatingController } from './seating.controller.js';
import { SeatingService } from './seating.service.js';

@Module({ controllers: [HealthController, SeatingController], providers: [PrismaService, IdentityGuard, EventsClient, GuestsClient, SeatingService, OutboxPublisher] })
export class SeatingModule {}
