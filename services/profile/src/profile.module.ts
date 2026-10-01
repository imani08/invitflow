import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { PrismaService } from './prisma.service.js';
import { ProfileController } from './profile.controller.js';
import { OutboxPublisher } from './outbox-publisher.js';

@Module({
  controllers: [HealthController, ProfileController],
  providers: [PrismaService, IdentityGuard, OutboxPublisher],
})
export class ProfileModule {}
