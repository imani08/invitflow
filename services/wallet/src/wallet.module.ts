import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { IdentityGuard } from './identity.guard.js';
import { InternalServiceGuard } from './internal.guard.js';
import { OutboxPublisher } from './outbox-publisher.js';
import { PaymentConsumer } from './payment-consumer.js';
import { PrismaService } from './prisma.service.js';
import { WalletController, WalletInternalController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';

@Module({ controllers: [HealthController, WalletController, WalletInternalController], providers: [PrismaService, IdentityGuard, InternalServiceGuard, WalletService, OutboxPublisher, PaymentConsumer] })
export class WalletModule {}
