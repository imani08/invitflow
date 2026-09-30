import { Module } from '@nestjs/common';
import { EventConsumer } from './event-consumer.js';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PrismaService } from './prisma.service.js';

@Module({ controllers: [HealthController, NotificationsController], providers: [PrismaService, IdentityGuard, NotificationsService, EventConsumer] })
export class NotificationsModule {}
