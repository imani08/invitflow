import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from './identity.guard.js';
import { AnalyticsAdminGuard, IdentityGuard } from './identity.guard.js';
import { AnalyticsService } from './analytics.service.js';

@Controller('/v1/admin/analytics')
@UseGuards(IdentityGuard, AnalyticsAdminGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('/daily')
  daily(
    @Req() _request: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    for (const [name, value] of [
      ['from', from],
      ['to', to],
    ] as const) {
      if (
        value !== undefined &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)))
      ) {
        throw new BadRequestException(`${name} doit être une date ISO (YYYY-MM-DD).`);
      }
    }
    return this.analytics.list(from, to);
  }
}
