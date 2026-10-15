import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { IdentityGuard, type VerifiedIdentity } from './identity.guard.js';
import { NotificationsService } from './notifications.service.js';

type AuthenticatedRequest = FastifyRequest & { identity: VerifiedIdentity };

@Controller('/v1/notifications')
@UseGuards(IdentityGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('limit') limit?: string, @Query('cursor') cursor?: string, @Query('unread') unread?: string) {
    if (unread !== undefined && unread !== 'true' && unread !== 'false') throw new BadRequestException('Le filtre unread doit être true ou false.');
    return this.notifications.list(request.identity.subject, limit, cursor, unread === 'true');
  }

  @Post('/read-all') markAllRead(@Req() request: AuthenticatedRequest) { return this.notifications.markAllRead(request.identity.subject); }
  @Patch('/:notificationId/read') markRead(@Req() request: AuthenticatedRequest, @Param('notificationId') id: string) { return this.notifications.markRead(request.identity.subject, id); }
  @Get('/preferences') preferences(@Req() request: AuthenticatedRequest) { return this.notifications.preferences(request.identity.subject); }
  @Post('/preferences') updatePreferences(@Req() request: AuthenticatedRequest, @Body() body: unknown) { return this.notifications.updatePreferences(request.identity.subject, body); }
  @Post('/admin/announcements') announce(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    if (!request.identity.roles.includes('SUPER_ADMIN')) throw new ForbiddenException('Permission Super Admin requise.');
    return this.notifications.announce(request.identity.subject, body);
  }
}
