import { Module } from '@nestjs/common';
import { AiDesignController } from './ai-design.controller.js';
import { AiDesignService } from './ai-design.service.js';
import { ComfyUIImageProvider } from './comfy-image-provider.js';
import { DesignsClient } from './designs-client.js';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PrismaService } from './prisma.service.js';
import { PreviewStorage } from './preview-storage.js';
import { Worker } from './worker.js';

@Module({ controllers: [HealthController, AiDesignController], providers: [PrismaService, IdentityGuard, DesignsClient, PreviewStorage, ComfyUIImageProvider, AiDesignService, OutboxPublisher, Worker] })
export class AiDesignModule {}
