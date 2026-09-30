import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from './identity.guard.js';
import { IdentityGuard } from './identity.guard.js';
import { InternalServiceGuard } from './internal.guard.js';
import { WalletService } from './wallet.service.js';

@Controller('/v1/wallet')
@UseGuards(IdentityGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}
  @Get('/me') me(@Req() request: AuthenticatedRequest) { return this.wallet.balance(request.identity!.subject); }
  @Get('/me/transactions') transactions(@Req() request: AuthenticatedRequest, @Query('cursor') cursor?: string, @Query('limit') limit?: string) { return this.wallet.transactions(request.identity!.subject, cursor, limit); }
}

@Controller('/v1/internal/wallets/:ownerSubject')
@UseGuards(InternalServiceGuard)
export class WalletInternalController {
  constructor(private readonly wallet: WalletService) {}
  @Post('/credits') credit(@Param('ownerSubject') owner: string, @Headers('idempotency-key') key: string, @Body() body: unknown) { return this.wallet.credit(owner, key, body); }
  @Post('/reservations') reserve(@Param('ownerSubject') owner: string, @Headers('idempotency-key') key: string, @Body() body: unknown) { return this.wallet.reserve(owner, key, body); }
  @Post('/reservations/:referenceId/consume') consume(@Param('ownerSubject') owner: string, @Param('referenceId') reference: string, @Headers('idempotency-key') key: string) { return this.wallet.finalizeReservation(owner, reference, key, 'CONSUMED'); }
  @Post('/reservations/:referenceId/release') release(@Param('ownerSubject') owner: string, @Param('referenceId') reference: string, @Headers('idempotency-key') key: string) { return this.wallet.finalizeReservation(owner, reference, key, 'RELEASED'); }
  @Post('/reservations/:referenceId/settle') settle(@Param('ownerSubject') owner: string, @Param('referenceId') reference: string, @Headers('idempotency-key') key: string, @Body() body: unknown) { return this.wallet.settleReservation(owner, reference, key, body); }
  @Post('/entries/:entryId/reverse') reverse(@Param('ownerSubject') owner: string, @Param('entryId') entry: string, @Headers('idempotency-key') key: string) { return this.wallet.reverse(owner, entry, key); }
}
