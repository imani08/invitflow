import { Module } from '@nestjs/common';
import { AccessController, PublicCheckInLinkController } from './access.controller.js';
import { CheckInLinkService } from './checkin-link.service.js';
import { EventsClient } from './events-client.js';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { PrismaService } from './prisma.service.js';
import { AccessService } from './access.service.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { CheckInLicenseService } from './checkin-license.service.js';
import { CheckInLicensePaymentConsumer } from './checkin-license-payment-consumer.js';

@Module({ controllers: [AccessController, PublicCheckInLinkController, HealthController], providers: [AccessService, CheckInLinkService, CheckInLicenseService, CheckInLicensePaymentConsumer, EventsClient, IdentityGuard, PrismaService, OutboxPublisher] })
export class AccessModule {}
