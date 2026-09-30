import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { FinanceAdminGuard, IdentityGuard } from './identity.guard.js';
import { HealthController } from './health.controller.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PrismaService } from './prisma.service.js';

@Module({ controllers: [BillingController, HealthController], providers: [PrismaService, IdentityGuard, FinanceAdminGuard, BillingService, OutboxPublisher] })
export class BillingModule {}
