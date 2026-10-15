import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AccessService } from './access.service.js';
import { CheckInLinkService } from './checkin-link.service.js';
import { CheckInLicenseService } from './checkin-license.service.js';
import type { AuthenticatedRequest } from './identity.guard.js';
import { IdentityGuard } from './identity.guard.js';

@Controller()
@UseGuards(IdentityGuard)
export class AccessController {
  constructor(private readonly access: AccessService, private readonly links: CheckInLinkService, private readonly licenseService: CheckInLicenseService) {}
  @Get('/check-in/licenses') licenses(@Req() req: AuthenticatedRequest) { return this.licenseService.list(req.identity!.subject); }
  @Get('/events/:eventId/access-agents')
  list(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Headers('authorization') auth: string) { return this.access.listAgents(req.identity!.subject, eventId, auth); }
  @Put('/events/:eventId/access-agents/:agentSubject')
  assign(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('agentSubject') agentSubject: string, @Headers('authorization') auth: string, @Body() body: unknown) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    if (Object.keys(input).some((key) => key !== 'ceremonyIds')) throw new BadRequestException('Données d’affectation invalides.');
    return this.access.assignAgent(req.identity!.subject, eventId, agentSubject, input['ceremonyIds'], auth);
  }
  @Put('/events/:eventId/ceremonies/:ceremonyId/access-agents/:agentSubject')
  assignForCeremony(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Param('agentSubject') agentSubject: string, @Headers('authorization') auth: string, @Body() body: unknown) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    if (Object.keys(input).some((key) => key !== 'ceremonyIds')) throw new BadRequestException('Données d’affectation invalides.');
    const ids = input['ceremonyIds'] === undefined ? [ceremonyId] : input['ceremonyIds'];
    return this.access.assignAgent(req.identity!.subject, eventId, agentSubject, ids, auth);
  }
  @Delete('/events/:eventId/access-agents/:agentSubject')
  revoke(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('agentSubject') agentSubject: string, @Headers('authorization') auth: string) { return this.access.revokeAgent(req.identity!.subject, eventId, agentSubject, auth); }
  @Delete('/events/:eventId/ceremonies/:ceremonyId/access-agents/:agentSubject')
  revokeForCeremony(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Param('agentSubject') agentSubject: string, @Headers('authorization') auth: string) { return this.access.removeCeremonyGrant(req.identity!.subject, eventId, agentSubject, ceremonyId, auth); }
  @Get('/check-in/events/:eventId')
  async context(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Headers('authorization') auth: string) { return this.access.getAgentContext(req.identity!.subject, eventId, auth); }
  @Get('/events/:eventId/check-in')
  summary(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Headers('authorization') auth: string, @Query('ceremonyId') ceremonyId: string) { return this.access.getScanSummary(req.identity!.subject, eventId, ceremonyId, auth); }
  @Post('/events/:eventId/check-in/scan')
  scan(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Headers('authorization') auth: string, @Headers('x-checkin-device-id') deviceId: string | undefined, @Body() body: unknown) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    if (Object.keys(input).some((key) => !['token', 'ceremonyId', 'companionCount'].includes(key))) throw new BadRequestException('Données de scan invalides.');
    return this.access.scan(req.identity!.subject, eventId, input as { token: string; ceremonyId: string; companionCount?: number }, auth, deviceId, req.headers['user-agent']);
  }
  @Get('/events/:eventId/check-in-links')
  listLinks(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Headers('authorization') auth: string) { return this.links.list(req.identity!.subject, eventId, auth); }
  @Post('/events/:eventId/check-in-links')
  createLink(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Headers('authorization') auth: string, @Body() body: unknown) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    if (Object.keys(input).some((key) => !['label', 'ceremonyIds'].includes(key))) throw new BadRequestException('Données de lien de pointage invalides.');
    return this.links.create(req.identity!.subject, eventId, input, auth);
  }
  @Patch('/events/:eventId/check-in-links/:linkId')
  refreshLink(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('linkId') linkId: string, @Headers('authorization') auth: string, @Body() body: unknown) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    if (Object.keys(input).some((key) => key !== 'ceremonyIds')) throw new BadRequestException('Données de portée invalides.');
    return this.links.refreshScope(req.identity!.subject, eventId, linkId, input, auth);
  }
  @Post('/events/:eventId/check-in-links/:linkId/replace')
  replaceLink(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('linkId') linkId: string, @Headers('authorization') auth: string, @Body() body: unknown) {
    if (body && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) throw new BadRequestException('Données de remplacement invalides.');
    return this.links.replace(req.identity!.subject, eventId, linkId, auth);
  }
  @Delete('/events/:eventId/check-in-links/:linkId')
  revokeLink(@Req() req: AuthenticatedRequest, @Param('eventId') eventId: string, @Param('linkId') linkId: string, @Headers('authorization') auth: string) { return this.links.revoke(req.identity!.subject, eventId, linkId, auth); }
}

@Controller('/public/check-in-links')
export class PublicCheckInLinkController {
  constructor(private readonly links: CheckInLinkService) {}
  @Get('/:token/context')
  context(@Param('token') token: string) { return this.links.publicContext(token); }
  @Post('/:token/scan')
  scan(@Param('token') token: string, @Req() req: import('fastify').FastifyRequest, @Headers('x-checkin-device-id') deviceId: string | undefined, @Body() body: unknown) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    if (Object.keys(input).some((key) => !['token', 'ceremonyId', 'companionCount'].includes(key))) throw new BadRequestException('Données de scan invalides.');
    return this.links.publicScan(token, input, deviceId, req.headers['user-agent']);
  }
}
