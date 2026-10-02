import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { FinanceAdminGuard, IdentityGuard } from './identity.guard.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PartnerAdminController, PartnersController, PaymentFinanceController, PaymentReconciliationController, PaymentsController, PaymentWebhookController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PartnersService } from './partners.service.js';
import { PrismaService } from './prisma.service.js';
import { ReconciliationJob } from './reconciliation-job.js';

@Module({ controllers: [HealthController, PaymentsController, PaymentWebhookController, PaymentReconciliationController, PaymentFinanceController, PartnersController, PartnerAdminController], providers: [PrismaService, IdentityGuard, FinanceAdminGuard, PaymentsService, PartnersService, OutboxPublisher, ReconciliationJob] })
export class PaymentsModule {}
