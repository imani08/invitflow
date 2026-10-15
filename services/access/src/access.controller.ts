import { BadRequestException, Body, Controller, Delete, Get, GoneException, Headers, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { CheckInLinkService } from './checkin-link.service.js';
import { CheckInLicenseService } from './checkin-license.service.js';
import type { AuthenticatedRequest } from './identity.guard.js';
import { IdentityGuard } from './identity.guard.js';

@Controller()
@UseGuards(IdentityGuard)
export class AccessController {
  constructor(private readonly links: CheckInLinkService, private readonly licenseService: CheckInLicenseService) {}
  @Get('/check-in/licenses') licenses(@Req() req: AuthenticatedRequest) { return this.licenseService.list(req.identity!.subject); }
  @Get('/events/:eventId/access-agents')
  list() { throw new GoneException('Le pointage par compte agent est retiré. Utilisez un lien de pointage sécurisé partageable.'); }
  @Put('/events/:eventId/access-agents/:agentSubject')
  assign() { throw new GoneException('Le pointage par compte agent est retiré. Utilisez un lien de pointage sécurisé partageable.'); }
  @Put('/events/:eventId/ceremonies/:ceremonyId/access-agents/:agentSubject')
  assignForCeremony() { throw new GoneException('Le pointage par compte agent est retiré. Utilisez un lien de pointage sécurisé partageable.'); }
  @Delete('/events/:eventId/access-agents/:agentSubject')
  revoke() { throw new GoneException('Le pointage par compte agent est retiré.'); }
  @Delete('/events/:eventId/ceremonies/:ceremonyId/access-agents/:agentSubject')
  revokeForCeremony() { throw new GoneException('Le pointage par compte agent est retiré.'); }
  @Get('/check-in/events/:eventId')
  context() { throw new GoneException('Utilisez un lien de pointage sécurisé partageable.'); }
  @Get('/events/:eventId/check-in')
  summary() { throw new GoneException('Utilisez un lien de pointage sécurisé partageable.'); }
  @Post('/events/:eventId/check-in/scan')
  scan() { throw new GoneException('Utilisez un lien de pointage sécurisé partageable.'); }
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
