import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { AgenciesController } from './agencies.controller.js';
import { AgencyPaymentConsumer } from './agency-payment-consumer.js';
import { AgencyQuotaInternalController } from './agency-quota-internal.controller.js';
import { InternalServiceGuard } from './internal.guard.js';
import { EventsService } from './events.service.js';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PrismaService } from './prisma.service.js';

@Module({ controllers: [HealthController, EventsController, AgenciesController, AgencyQuotaInternalController], providers: [PrismaService, IdentityGuard, InternalServiceGuard, EventsService, OutboxPublisher, AgencyPaymentConsumer] })
export class EventsModule {}
