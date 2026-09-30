import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, PayloadTooLargeException, Post, Put, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { maxImportBytes } from './env.js';
import { IdentityGuard, type AuthenticatedRequest } from './identity.guard.js';
import { SeatingService } from './seating.service.js';

@Controller('/v1/events/:eventId/ceremonies/:ceremonyId/seating')
@UseGuards(IdentityGuard)
export class SeatingController {
  constructor(private readonly seating: SeatingService) {}

  @Get()
  getPlan(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string) {
    return this.seating.getPlan(request.identity!.subject, eventId, ceremonyId, this.authorization(request));
  }

  @Put()
  setMode(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Body() body: unknown) {
    return this.seating.setMode(request.identity!.subject, eventId, ceremonyId, this.authorization(request), body);
  }

  @Get('/tables')
  tables(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string) {
    return this.seating.listTables(request.identity!.subject, eventId, ceremonyId, this.authorization(request));
  }

  @Post('/tables')
  createTable(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Body() body: unknown) {
    return this.seating.createTable(request.identity!.subject, eventId, ceremonyId, this.authorization(request), body);
  }

  @Patch('/tables/:tableId')
  updateTable(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Param('tableId') tableId: string, @Body() body: unknown) {
    return this.seating.updateTable(request.identity!.subject, eventId, ceremonyId, tableId, this.authorization(request), body);
  }

  @Delete('/tables/:tableId')
  deleteTable(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Param('tableId') tableId: string) {
    return this.seating.deleteTable(request.identity!.subject, eventId, ceremonyId, tableId, this.authorization(request));
  }

  @Get('/zones')
  zones(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string) {
    return this.seating.listZones(request.identity!.subject, eventId, ceremonyId, this.authorization(request));
  }

  @Post('/zones')
  createZone(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Body() body: unknown) {
    return this.seating.createZone(request.identity!.subject, eventId, ceremonyId, this.authorization(request), body);
  }

  @Patch('/zones/:zoneId')
  updateZone(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Param('zoneId') zoneId: string, @Body() body: unknown) {
    return this.seating.updateZone(request.identity!.subject, eventId, ceremonyId, zoneId, this.authorization(request), body);
  }

  @Delete('/zones/:zoneId')
  deleteZone(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Param('zoneId') zoneId: string) {
    return this.seating.deleteZone(request.identity!.subject, eventId, ceremonyId, zoneId, this.authorization(request));
  }

  @Get('/assignments')
  assignments(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string) {
    return this.seating.listAssignments(request.identity!.subject, eventId, ceremonyId, this.authorization(request));
  }

  @Post('/assignments')
  assign(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Body() body: unknown) {
    return this.seating.assign(request.identity!.subject, eventId, ceremonyId, this.authorization(request), body);
  }

  @Delete('/assignments/:guestId')
  unassign(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Param('guestId') guestId: string) {
    return this.seating.unassign(request.identity!.subject, eventId, ceremonyId, guestId, this.authorization(request));
  }

  @Post('/imports')
  async uploadImport(@Req() request: FastifyRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string) {
    const authRequest = request as AuthenticatedRequest;
    let file: Awaited<ReturnType<typeof authRequest.file>>;
    try { file = await authRequest.file({ limits: { files: 1, fileSize: maxImportBytes(), fields: 0, parts: 1 } }); }
    catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 413) throw new PayloadTooLargeException('Le fichier doit peser au maximum 5 Mo.');
      throw new BadRequestException('Le formulaire de fichier est invalide.');
    }
    if (!file) throw new BadRequestException('Choisissez un fichier .xlsx ou .csv.');
    let buffer: Buffer;
    try { buffer = await file.toBuffer(); } catch { throw new PayloadTooLargeException('Le fichier doit peser au maximum 5 Mo.'); }
    if (file.file.truncated || buffer.length > maxImportBytes()) throw new PayloadTooLargeException('Le fichier doit peser au maximum 5 Mo.');
    const auth = authRequest.headers['authorization'];
    if (typeof auth !== 'string') throw new BadRequestException('Jeton d’identité manquant.');
    return this.seating.analyzeTableImport(authRequest.identity!.subject, eventId, ceremonyId, auth, file.filename, file.mimetype, buffer);
  }

  @Get('/imports/:jobId')
  getImport(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Param('jobId') jobId: string) {
    return this.seating.getTableImport(request.identity!.subject, eventId, ceremonyId, jobId, this.authorization(request));
  }

  @Post('/imports/:jobId/commit')
  commitImport(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Param('jobId') jobId: string) {
    return this.seating.commitTableImport(request.identity!.subject, eventId, ceremonyId, jobId, this.authorization(request));
  }

  private authorization(request: AuthenticatedRequest) {
    const value = request.headers['authorization'];
    if (typeof value !== 'string') throw new UnauthorizedException('Identity token missing');
    return value;
  }
}
