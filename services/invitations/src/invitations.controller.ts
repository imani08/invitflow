import { BadRequestException, Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Headers, Injectable, Param, Post, Query, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import type { AuthenticatedRequest } from './identity.guard.js';
import { IdentityGuard } from './identity.guard.js';
import { InvitationService } from './invitation.service.js';
import { InternalServiceGuard } from './internal-service.guard.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller('/v1') @UseGuards(IdentityGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationService) {}
  @Post('/events/:eventId/invitations/batches') create(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Headers('authorization') authorization: string, @Headers('idempotency-key') key: string, @Body() body: unknown) { return this.invitations.createBatch(req.identity!.subject, eventId, authorization, key, body); }
  @Get('/events/:eventId/invitations/batches') list(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.invitations.list(req.identity!.subject, eventId, limit, cursor); }
  @Get('/events/:eventId/invitations/batches/:batchId') getForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.getBatch(req.identity!.subject, id); }
  @Post('/events/:eventId/invitations/batches/:batchId/cancel') cancelForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.cancel(req.identity!.subject, id); }
  @Post('/events/:eventId/invitations/batches/:batchId/regenerate') regenerateForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.regenerateZip(req.identity!.subject, id); }
  @Get('/events/:eventId/invitations/batches/:batchId/download') async zipForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') id: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, id); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body as unknown as import('node:stream/web').ReadableStream)); }
  @Get('/events/:eventId/invitations/batches/:batchId/items/:itemId/download') async pdfForEvent(@Req() req: AuthenticatedRequest, @Param('batchId') batch: string, @Param('itemId') item: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, batch, item); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body as unknown as import('node:stream/web').ReadableStream)); }
  @Get('/invitations/batches') listAll(@Req() req: AuthenticatedRequest, @Query('eventId') eventId?: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.invitations.list(req.identity!.subject, eventId, limit, cursor); }
  @Get('/invitations/batches/:batchId') get(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.getBatch(req.identity!.subject, id); }
  @Post('/invitations/batches/:batchId/cancel') cancel(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.cancel(req.identity!.subject, id); }
  @Post('/invitations/batches/:batchId/regenerate') regenerate(@Req() req: AuthenticatedRequest, @Param('batchId') id: string) { return this.invitations.regenerateZip(req.identity!.subject, id); }
  @Get('/invitations/batches/:batchId/download') async zip(@Req() req: AuthenticatedRequest, @Param('batchId') id: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, id); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body as unknown as import('node:stream/web').ReadableStream)); }
  @Get('/invitations/batches/:batchId/items/:itemId/download') async pdf(@Req() req: AuthenticatedRequest, @Param('batchId') batch: string, @Param('itemId') item: string, @Res() reply: FastifyReply) { const file = await this.invitations.download(req.identity!.subject, batch, item); return reply.header('content-type', file.type).header('content-disposition', `attachment; filename="${file.name}"`).header('cache-control','private, no-store').send(Readable.fromWeb(file.body as unknown as import('node:stream/web').ReadableStream)); }
}

@Controller('/v1/admin/storage')
@UseGuards(IdentityGuard)
export class InvitationStorageAdminController {
  constructor(private readonly invitations: InvitationService) {}
  @Get()
  stats(@Req() req: AuthenticatedRequest) {
    if (!req.identity?.roles.some((role) => role === 'SUPER_ADMIN' || role === 'SUPPORT_ADMIN'))
      throw new ForbiddenException('Permission d’administration requise.');
    return this.invitations.getAdminStorageStats();
  }
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

@Injectable()
export class InvitationStorageMonitorGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<import('fastify').FastifyRequest>();
    const presented = request.headers['x-storage-monitor-token'];
    const expected = process.env['STORAGE_MONITOR_TOKEN'];
    if (typeof presented !== 'string' || !expected || expected.length < 32 || presented.length > 512) throw new UnauthorizedException();
    if (!timingSafeEqual(createHash('sha256').update(presented).digest(), createHash('sha256').update(expected).digest())) throw new UnauthorizedException();
    return true;
  }
}

@Controller('/v1/internal/storage')
@UseGuards(InvitationStorageMonitorGuard)
export class InvitationStorageReferenceController {
  constructor(private readonly invitations: InvitationService) {}
  @Get('/object-keys')
  objectKeys(@Query('pdfCursor') pdfCursor?: string, @Query('zipCursor') zipCursor?: string) {
    if (pdfCursor !== undefined && !uuid.test(pdfCursor) || zipCursor !== undefined && !uuid.test(zipCursor)) throw new BadRequestException('Curseur de stockage invalide.');
    return this.invitations.getStorageInventoryPage(pdfCursor, zipCursor);
  }
  @Post('/reference-check')
  check(@Body() body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Requête de référence invalide.');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['assetId', 'objectKey'].includes(key)) || typeof input.assetId !== 'string' || !uuid.test(input.assetId) || typeof input.objectKey !== 'string' || !/^assets\/[0-9a-f-]{36}(?:\/(?:preview|thumbnail))?$/i.test(input.objectKey)) throw new BadRequestException('Requête de référence invalide.');
    return this.invitations.checkStorageReference(input.assetId, input.objectKey);
  }
}
