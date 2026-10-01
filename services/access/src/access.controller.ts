import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AccessService } from './access.service.js';
import type { AuthenticatedRequest } from './identity.guard.js';
import { IdentityGuard } from './identity.guard.js';

@Controller('/v1')
@UseGuards(IdentityGuard)
export class AccessController {
  constructor(private readonly access: AccessService) {}
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
}
