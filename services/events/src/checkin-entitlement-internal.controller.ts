import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { InternalServiceGuard } from './internal.guard.js';
import { EventsService } from './events.service.js';

@Controller('/v1/internal/events')
@UseGuards(InternalServiceGuard)
export class CheckInEntitlementInternalController {
  constructor(private readonly events: EventsService) {}
  @Get('/:eventId/check-in-entitlement') entitlement(@Param('eventId') eventId: string) { return this.events.agencyCheckInEntitlement(eventId); }
}
