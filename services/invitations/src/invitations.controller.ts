import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import type { AuthenticatedRequest } from './identity.guard.js';
import { IdentityGuard } from './identity.guard.js';
import { InvitationService } from './invitation.service.js';

@Controller('/v1') @UseGuards(IdentityGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationService) {}
  @Post('/events/:eventId/invitations/batches') create(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Headers('authorization') authorization: string, @Headers('idempotency-key') key: string, @Body() body: unknown) { return this.invitations.createBatch(req.identity!.subject, eventId, authorization, key, body); }
  @Get('/events/:eventId/invitations/batches') list(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string) { return this.invitations.list(req.identity!.subject, eventId); }
  @Get('/events/:eventId/invitations/batches/:batchId') getForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.getBatch(req.identity!.subject, id); }
  @Post('/events/:eventId/invitations/batches/:batchId/cancel') cancelForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.cancel(req.identity!.subject, id); }
  @Get('/events/:eventId/invitations/batches/:batchId/download') async zipForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') id: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, id); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body)); }
  @Get('/events/:eventId/invitations/batches/:batchId/items/:itemId/download') async pdfForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') batch: string, @Param('itemId') item: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, batch, item); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body)); }
  @Get('/invitations/batches') listAll(@Req() req: AuthenticatedRequest, @Query('eventId') eventId?: string) { return this.invitations.list(req.identity!.subject, eventId); }
  @Get('/invitations/batches/:batchId') get(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.getBatch(req.identity!.subject, id); }
  @Post('/invitations/batches/:batchId/cancel') cancel(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.cancel(req.identity!.subject, id); }
  @Get('/invitations/batches/:batchId/download') async zip(@Req() req: AuthenticatedRequest, @Param('batchId') id: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, id); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body)); }
  @Get('/invitations/batches/:batchId/items/:itemId/download') async pdf(@Req() req: AuthenticatedRequest, @Param('batchId') batch: string, @Param('itemId') item: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, batch, item); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body)); }
  @Post('/events/:eventId/check-in/scan') scan(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() body: unknown) { const input = body && typeof body === 'object' ? body as Record<string, unknown> : {}; if (Object.keys(input).some(key => !['token', 'ceremonyId', 'companionCount'].includes(key)) || typeof input.token !== 'string' || typeof input.ceremonyId !== 'string' || (input.companionCount !== undefined && typeof input.companionCount !== 'number')) throw new BadRequestException('Données de scan invalides.'); return this.invitations.checkIn(req.identity!.subject, eventId, input.ceremonyId, input.token, input.companionCount === undefined ? 0 : input.companionCount as number); }
  @Get('/events/:eventId/check-in') summary(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Query('ceremonyId') ceremonyId: string) { return this.invitations.checkInSummary(req.identity!.subject, eventId, ceremonyId); }
}

@Controller('/v1/public/invitations')
export class PublicInvitationsController {
  constructor(private readonly invitations: InvitationService) {}
  @Get('/:token') get(@Param('token') token: string) { return this.invitations.publicInvitation(token); }
  @Post('/:token/rsvp') rsvp(@Param('token') token: string, @Body() body: unknown) { return this.invitations.submitRsvp(token, body); }
}
