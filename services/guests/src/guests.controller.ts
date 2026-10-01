import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, PayloadTooLargeException, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { maxImportBytes } from './env.js';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard.js';
import { GuestsService } from './guests.service.js';

@Controller('/v1/events/:eventId/guests')
@UseGuards(IdentityGuard)
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Query('cursor') cursor?: string, @Query('limit') rawLimit?: string, @Query('q') search?: string, @Query('groupId') groupId?: string, @Query('ceremonyId') ceremonyId?: string) {
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('limit doit être compris entre 1 et 100.');
    if (search !== undefined && search.length > 160) throw new BadRequestException('q ne peut pas dépasser 160 caractères.');
    return this.guests.list(request.identity!.subject, eventId, this.authorization(request), limit, cursor, search?.trim(), groupId, ceremonyId);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() body: unknown) {
    return this.guests.create(request.identity!.subject, eventId, this.authorization(request), body as Record<string, unknown>);
  }

  @Get('/groups') groups(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.guests.groups(request.identity!.subject, eventId, this.authorization(request));
  }

  @Post('/groups') createGroup(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() body: unknown) {
    return this.guests.createGroup(request.identity!.subject, eventId, this.authorization(request), body);
  }

  @Patch('/groups/:groupId') updateGroup(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('groupId') groupId: string, @Body() body: unknown) {
    return this.guests.updateGroup(request.identity!.subject, eventId, groupId, this.authorization(request), body);
  }

  @Delete('/groups/:groupId') deleteGroup(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('groupId') groupId: string) {
    return this.guests.deleteGroup(request.identity!.subject, eventId, groupId, this.authorization(request));
  }

  @Get('/:guestId') get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('guestId') guestId: string) {
    return this.guests.get(request.identity!.subject, eventId, guestId, this.authorization(request));
  }

  @Patch('/:guestId') update(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('guestId') guestId: string, @Body() body: unknown) {
    return this.guests.update(request.identity!.subject, eventId, guestId, this.authorization(request), body as Record<string, unknown>);
  }

  @Delete('/:guestId') archive(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('guestId') guestId: string) {
    return this.guests.archive(request.identity!.subject, eventId, guestId, this.authorization(request));
  }

  @Put('/:guestId/ceremonies') updateAccess(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('guestId') guestId: string, @Body() body: unknown) {
    return this.guests.updateAccess(request.identity!.subject, eventId, guestId, this.authorization(request), body);
  }

  @Delete('/:guestId/ceremonies/:ceremonyId') removeCeremonyAccess(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('guestId') guestId: string, @Param('ceremonyId') ceremonyId: string) {
    return this.guests.removeCeremonyAccess(request.identity!.subject, eventId, guestId, ceremonyId, this.authorization(request));
  }

  private authorization(request: AuthenticatedRequest) {
    const value = request.headers['authorization'];
    if (typeof value !== 'string') throw new BadRequestException('Jeton d’identité manquant.');
    return value;
  }
}

@Controller('/v1/events/:eventId/guest-imports')
@UseGuards(IdentityGuard)
export class GuestImportsController {
  constructor(private readonly guests: GuestsService) {}

  @Post()
  async upload(@Req() request: FastifyRequest, @Param('eventId') eventId: string) {
    const authRequest = request as AuthenticatedRequest;
    let file: Awaited<ReturnType<typeof authRequest.file>>;
    try { file = await authRequest.file({ limits: { files: 1, fileSize: maxImportBytes(), fields: 0, parts: 1 } }); }
    catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 413) throw new PayloadTooLargeException('Le fichier doit peser au maximum 5 Mo.');
      throw new BadRequestException('Le formulaire de fichier est invalide.');
    }
    if (!file) throw new BadRequestException('Choisissez un fichier .xlsx ou .csv.');
    let buffer: Buffer;
    try { buffer = await file.toBuffer(); }
    catch { throw new PayloadTooLargeException('Le fichier doit peser au maximum 5 Mo.'); }
    if (file.file.truncated || buffer.length > maxImportBytes()) throw new BadRequestException('Le fichier doit peser au maximum 5 Mo.');
    const auth = authRequest.headers['authorization'];
    if (typeof auth !== 'string') throw new BadRequestException('Jeton d’identité manquant.');
    return this.guests.analyzeImport(authRequest.identity!.subject, eventId, auth, file.filename, file.mimetype, buffer);
  }

  @Get('/:jobId')
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('jobId') jobId: string) {
    return this.guests.getImport(request.identity!.subject, eventId, jobId, this.authorization(request));
  }

  @Put('/:jobId/mapping')
  map(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('jobId') jobId: string, @Body() body: unknown) {
    return this.guests.mapImport(request.identity!.subject, eventId, jobId, this.authorization(request), body);
  }

  @Post('/:jobId/commit')
  commit(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('jobId') jobId: string) {
    return this.guests.commitImport(request.identity!.subject, eventId, jobId, this.authorization(request));
  }

  private authorization(request: AuthenticatedRequest) {
    const value = request.headers['authorization'];
    if (typeof value !== 'string') throw new BadRequestException('Jeton d’identité manquant.');
    return value;
  }
}
