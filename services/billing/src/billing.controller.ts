import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from './identity.guard.js';
import { FinanceAdminGuard, IdentityGuard } from './identity.guard.js';
import { BillingService } from './billing.service.js';

@Controller()
@UseGuards(IdentityGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  @Get('/v1/pricing') pricing() { return this.billing.catalog(); }
  @Post('/v1/quotes') quote(@Body() body: unknown) { return this.billing.quote(body); }
  @Post('/v1/admin/price-schedules')
  @UseGuards(FinanceAdminGuard)
  createSchedule(@Req() request: AuthenticatedRequest, @Headers('idempotency-key') key: string, @Body() body: unknown) { return this.billing.createSchedule(request.identity!.subject, key, body); }
}
