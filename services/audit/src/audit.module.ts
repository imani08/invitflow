import { Module } from '@nestjs/common';
import { AdminModerationController, AuditController, ModerationReportController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { EventConsumer } from './event-consumer.js';
import { HealthController } from './health.controller.js';
import { IdentityGuard, SupportAdminGuard } from './identity.guard.js';
import { PrismaService } from './prisma.service.js';

@Module({ controllers: [HealthController, AuditController, ModerationReportController, AdminModerationController], providers: [PrismaService, IdentityGuard, SupportAdminGuard, AuditService, EventConsumer] })
export class AuditModule {}
