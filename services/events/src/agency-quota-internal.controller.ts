import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { InternalServiceGuard } from './internal.guard.js';

@Controller('/v1/internal/agencies/:workspaceId/quota/:referenceKey')
@UseGuards(InternalServiceGuard)
export class AgencyQuotaInternalController {
  constructor(private readonly events: EventsService) {}
  @Post('/settle') settle(@Param('workspaceId') workspaceId: string, @Param('referenceKey') referenceKey: string, @Body() body: { consumedCredits?: unknown }) {
    if (body?.consumedCredits !== undefined && typeof body.consumedCredits !== 'number') throw new BadRequestException('consumedCredits must be an integer');
    return this.events.finalizeAgencyQuotaReservation('internal:invitations', workspaceId, referenceKey, 'CONSUMED', body?.consumedCredits as number | undefined, true);
  }
  @Post('/release') release(@Param('workspaceId') workspaceId: string, @Param('referenceKey') referenceKey: string) {
    return this.events.finalizeAgencyQuotaReservation('internal:invitations', workspaceId, referenceKey, 'RELEASED', undefined, true);
  }
}
