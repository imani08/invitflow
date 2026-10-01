import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { InvitationStorage } from './invitation-storage.js';
import { InvitationService } from './invitation.service.js';
import { InternalCheckInController, InvitationsController, PublicInvitationsController } from './invitations.controller.js';
import { InternalServiceGuard } from './internal-service.guard.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PrismaService } from './prisma.service.js';
@Module({ controllers: [HealthController, InvitationsController, PublicInvitationsController, InternalCheckInController], providers: [PrismaService, IdentityGuard, InternalServiceGuard, InvitationStorage, InvitationService, OutboxPublisher] }) export class InvitationsModule {}
