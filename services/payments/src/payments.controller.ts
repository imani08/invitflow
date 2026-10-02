import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from './identity.guard.js';
import { FinanceAdminGuard, IdentityGuard } from './identity.guard.js';
import { PaymentsService } from './payments.service.js';
import { PartnersService } from './partners.service.js';

@Controller('/v1/payments')
@UseGuards(IdentityGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Headers('authorization') authorization: string, @Headers('idempotency-key') key: string, @Body() body: unknown) {
    return this.payments.create(request.identity!.subject, authorization, key, body);
  }

  @Get('/me') list(@Req() request: AuthenticatedRequest, @Query('limit') limit?: string, @Query('cursor') cursor?: string) { return this.payments.list(request.identity!.subject, limit, cursor); }
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

@Controller('/v1/partners')
@UseGuards(IdentityGuard)
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}
  @Post('/attributions') attribute(@Req() request: AuthenticatedRequest, @Body() body: { code?: unknown; source?: unknown }) {
    if (body?.source !== undefined && body.source !== 'CODE' && body.source !== 'LINK') throw new BadRequestException('source must be CODE or LINK');
    return this.partners.attribute(request.identity!.subject, body?.code, body?.source === 'LINK' ? 'LINK' : 'CODE');
  }
  @Get('/me') dashboard(@Req() request: AuthenticatedRequest) { return this.partners.dashboard(request.identity!.subject); }
  @Post('/me/payouts') payout(@Req() request: AuthenticatedRequest, @Body() body: { currency?: unknown }) {
    if (body?.currency !== undefined && (typeof body.currency !== 'string' || !/^[A-Z]{3}$/.test(body.currency))) throw new BadRequestException('currency must be an ISO currency code');
    return this.partners.createPayout(request.identity!.subject, body.currency as string | undefined);
  }
}

@Controller('/v1/admin/partners')
@UseGuards(IdentityGuard, FinanceAdminGuard)
export class PartnerAdminController {
  constructor(private readonly partners: PartnersService) {}
  @Get() list() { return this.partners.adminList(); }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() body: { ownerSubject?: unknown; code?: unknown; commissionRateBps?: unknown; eligibleOrderTypes?: unknown }) {
    if (typeof body?.code !== 'string' || (body.ownerSubject !== undefined && body.ownerSubject !== null && typeof body.ownerSubject !== 'string') || typeof body.commissionRateBps !== 'number' || !Array.isArray(body.eligibleOrderTypes)) throw new BadRequestException('Partner details are invalid');
    return this.partners.adminCreate(request.identity!.subject, { ...(body.ownerSubject !== undefined ? { ownerSubject: body.ownerSubject as string | null } : {}), code: body.code, commissionRateBps: body.commissionRateBps, eligibleOrderTypes: body.eligibleOrderTypes as never[] });
  }
  @Patch('/:partnerId') update(@Req() request: AuthenticatedRequest, @Param('partnerId') id: string, @Body() body: { ownerSubject?: string | null; status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; commissionRateBps?: number; eligibleOrderTypes?: never[] }) { return this.partners.adminUpdate(request.identity!.subject, id, body); }
  @Get('/ledger') ledger() { return this.partners.adminLedger(); }
  @Get('/attributions') attributions() { return this.partners.adminAttributions(); }
  @Patch('/ledger/:entryId') ledgerStatus(@Req() request: AuthenticatedRequest, @Param('entryId') id: string, @Body() body: { status?: 'VALIDATED' | 'PAYABLE' | 'DISPUTED' }) { if (!body?.status) throw new BadRequestException('status is required'); return this.partners.adminSetLedgerStatus(request.identity!.subject, id, body.status); }
  @Get('/payouts') payouts() { return this.partners.adminPayouts(); }
  @Get('/audit') audit() { return this.partners.adminAuditEntries(); }
  @Patch('/payouts/:payoutId') payoutStatus(@Req() request: AuthenticatedRequest, @Param('payoutId') id: string, @Body() body: { status?: 'APPROVED' | 'PROCESSING' | 'PAID' | 'REJECTED'; externalReference?: string }) { if (!body?.status) throw new BadRequestException('status is required'); return this.partners.adminPayoutUpdate(request.identity!.subject, id, body.status, body.externalReference); }
}
