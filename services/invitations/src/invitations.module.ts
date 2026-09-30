import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { InvitationStorage } from './invitation-storage.js';
import { InvitationService } from './invitation.service.js';
import { InvitationsController, PublicInvitationsController } from './invitations.controller.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PrismaService } from './prisma.service.js';
@Module({ controllers: [HealthController, InvitationsController, PublicInvitationsController], providers: [PrismaService, IdentityGuard, InvitationStorage, InvitationService, OutboxPublisher] }) export class InvitationsModule {}
