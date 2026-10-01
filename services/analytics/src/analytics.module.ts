import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { EventConsumer } from './event-consumer.js';
import { HealthController } from './health.controller.js';
import { AnalyticsAdminGuard, IdentityGuard } from './identity.guard.js';
import { PrismaService } from './prisma.service.js';

@Module({
  controllers: [HealthController, AnalyticsController],
  providers: [PrismaService, AnalyticsService, EventConsumer, IdentityGuard, AnalyticsAdminGuard],
})
export class AnalyticsModule {}
