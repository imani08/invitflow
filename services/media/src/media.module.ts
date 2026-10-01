import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { MediaStorage } from './media-storage.js';
import { PrismaService } from './prisma.service.js';

@Module({
  controllers: [HealthController, MediaController],
  providers: [PrismaService, IdentityGuard, MediaStorage, MediaService],
})
export class MediaModule {}
