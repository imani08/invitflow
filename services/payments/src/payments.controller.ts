import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from './identity.guard.js';
import { FinanceAdminGuard, IdentityGuard } from './identity.guard.js';
import { PaymentsService } from './payments.service.js';

@Controller('/v1/payments')
@UseGuards(IdentityGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Headers('authorization') authorization: string, @Headers('idempotency-key') key: string, @Body() body: unknown) {
    return this.payments.create(request.identity!.subject, authorization, key, body);
  }

  @Get('/me') list(@Req() request: AuthenticatedRequest) { return this.payments.list(request.identity!.subject); }
  @Get('/:paymentId') get(@Req() request: AuthenticatedRequest, @Param('paymentId') paymentId: string) { return this.payments.get(request.identity!.subject, paymentId); }
  @Post('/:paymentId/mock-confirm') mockConfirm(@Req() request: AuthenticatedRequest, @Param('paymentId') paymentId: string) { return this.payments.mockConfirm(request.identity!.subject, paymentId); }
}

@Controller('/v1/payments/webhooks')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('/:provider') ping(@Param('provider') provider: string) {
    if (provider !== 'flexpay') return { status: 'not_found' };
    return { status: 'ok' };
  }

  @Post('/:provider')
  @HttpCode(200)
  receive(@Param('provider') provider: string, @Req() request: AuthenticatedRequest, @Body() body: unknown) {
    return this.payments.providerWebhook(provider, request.headers as Record<string, string | string[] | undefined>, body);
  }
}

@Controller('/v1/admin/reconciliation')
@UseGuards(IdentityGuard, FinanceAdminGuard)
export class PaymentReconciliationController {
  constructor(private readonly payments: PaymentsService) {}
  @Get('/issues') issues() { return this.payments.reconciliationIssues(); }
}

@Controller('/v1/admin/payments')
@UseGuards(IdentityGuard, FinanceAdminGuard)
export class PaymentFinanceController {
  constructor(private readonly payments: PaymentsService) {}
  @Get() list(@Query('provider') provider?: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.payments.adminPayments({ ...(provider !== undefined ? { provider } : {}), ...(limit !== undefined ? { limit } : {}), ...(cursor !== undefined ? { cursor } : {}) }); }
  @Post('/:paymentId/refund') refund(@Param('paymentId') paymentId: string) { return this.payments.refund(paymentId); }
}
