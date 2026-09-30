import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { FinanceAdminGuard, IdentityGuard } from './identity.guard.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PaymentFinanceController, PaymentReconciliationController, PaymentsController, PaymentWebhookController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PrismaService } from './prisma.service.js';
import { ReconciliationJob } from './reconciliation-job.js';

@Module({ controllers: [HealthController, PaymentsController, PaymentWebhookController, PaymentReconciliationController, PaymentFinanceController], providers: [PrismaService, IdentityGuard, FinanceAdminGuard, PaymentsService, OutboxPublisher, ReconciliationJob] })
export class PaymentsModule {}
