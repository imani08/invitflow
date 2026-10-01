import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import type { AuthenticatedRequest } from './identity.guard.js';
import { IdentityGuard } from './identity.guard.js';
import { InvitationService } from './invitation.service.js';
import { InternalServiceGuard } from './internal-service.guard.js';

@Controller('/v1') @UseGuards(IdentityGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationService) {}
  @Post('/events/:eventId/invitations/batches') create(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Headers('authorization') authorization: string, @Headers('idempotency-key') key: string, @Body() body: unknown) { return this.invitations.createBatch(req.identity!.subject, eventId, authorization, key, body); }
  @Get('/events/:eventId/invitations/batches') list(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.invitations.list(req.identity!.subject, eventId, limit, cursor); }
  @Get('/events/:eventId/invitations/batches/:batchId') getForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.getBatch(req.identity!.subject, id); }
  @Post('/events/:eventId/invitations/batches/:batchId/cancel') cancelForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.cancel(req.identity!.subject, id); }
  @Get('/events/:eventId/invitations/batches/:batchId/download') async zipForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') id: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, id); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body as unknown as import('node:stream/web').ReadableStream)); }
  @Get('/events/:eventId/invitations/batches/:batchId/items/:itemId/download') async pdfForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') batch: string, @Param('itemId') item: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, batch, item); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body as unknown as import('node:stream/web').ReadableStream)); }
  @Get('/invitations/batches') listAll(@Req() req: AuthenticatedRequest, @Query('eventId') eventId?: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.invitations.list(req.identity!.subject, eventId, limit, cursor); }
  @Get('/invitations/batches/:batchId') get(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.getBatch(req.identity!.subject, id); }
  @Post('/invitations/batches/:batchId/cancel') cancel(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.cancel(req.identity!.subject, id); }
  @Get('/invitations/batches/:batchId/download') async zip(@Req() req: AuthenticatedRequest, @Param('batchId') id: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, id); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body as unknown as import('node:stream/web').ReadableStream)); }
  @Get('/invitations/batches/:batchId/items/:itemId/download') async pdf(@Req() req: AuthenticatedRequest, @Param('batchId') batch: string, @Param('itemId') item: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, batch, item); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body as unknown as import('node:stream/web').ReadableStream)); }
}

@Controller('/v1/public/invitations')
export class PublicInvitationsController {
  constructor(private readonly invitations: InvitationService) {}
  @Get('/:token') get(@Param('token') token: string) { return this.invitations.publicInvitation(token); }
  @Post('/:token/rsvp') rsvp(@Param('token') token: string, @Body() body: unknown) { return this.invitations.submitRsvp(token, body); }
}

@Controller('/v1/internal/events/:eventId/check-in')
@UseGuards(InternalServiceGuard)
export class InternalCheckInController {
  constructor(private readonly invitations: InvitationService) {}
  @Post('/scan')
  scan(@Param('eventId') eventId: string, @Headers('x-event-owner-subject') owner: string, @Headers('x-checkin-operator-subject') operator: string, @Body() body: unknown) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    if (Object.keys(input).some((key) => !['token', 'ceremonyId', 'companionCount'].includes(key)) || typeof input.token !== 'string' || typeof input.ceremonyId !== 'string' || !Number.isInteger(input.companionCount)) throw new BadRequestException('Données de scan invalides.');
    if (!owner || owner.length > 255 || /[\s\u0000-\u001f\u007f]/.test(owner) || !operator || operator.length > 255 || /[\s\u0000-\u001f\u007f]/.test(operator)) throw new BadRequestException('Identité de pointage invalide.');
    return this.invitations.checkIn(owner, eventId, input.ceremonyId, input.token, input.companionCount as number, operator);
  }
  @Get('/summary')
  summary(@Param('eventId') eventId: string, @Headers('x-event-owner-subject') owner: string, @Query('ceremonyId') ceremonyId: string) {
    if (!owner || owner.length > 255 || /[\s\u0000-\u001f\u007f]/.test(owner)) throw new BadRequestException('Identité propriétaire invalide.');
    return this.invitations.checkInSummary(owner, eventId, ceremonyId);
  }
}
