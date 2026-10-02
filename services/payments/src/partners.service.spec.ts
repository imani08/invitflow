import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { PartnersService } from './partners.service.js';
import type { PrismaService } from './prisma.service.js';

const partner = { id: '11111111-1111-4111-8111-111111111111', code: 'TEAM7', ownerSubject: 'partner-owner', status: 'ACTIVE', commissionRateBps: 725, eligibleOrderTypes: ['CREDIT_PURCHASE'] };

test('attribution binds once, snapshots its source code and blocks self-referral/overwrite', async () => {
  let existing: Record<string, unknown> | null = null;
  const prisma = {
    partner: { findUnique: async ({ where }: { where: { code: string } }) => where.code === 'TEAM7' ? partner : { ...partner, id: '22222222-2222-4222-8222-222222222222', code: 'OTHER', ownerSubject: 'other-owner' } },
    referralAttribution: {
      findUnique: async () => existing,
      create: async ({ data }: { data: Record<string, unknown> }) => { existing = { id: 'attr-1', status: 'ACTIVE', ...data }; return existing; },
    },
  } as unknown as PrismaService;
  const service = new PartnersService(prisma);
  const first = await service.attribute('customer-a', 'TEAM7', 'LINK');
  assert.equal(first['codeSnapshot'], 'TEAM7');
  assert.equal(first['source'], 'LINK');
  assert.equal(await service.attribute('customer-a', 'TEAM7', 'CODE'), first);
  await assert.rejects(service.attribute('partner-owner', 'TEAM7'), ForbiddenException);
  await assert.rejects(service.attribute('customer-a', 'OTHER'), ConflictException);
});

test('payout request locks the partner and snapshots available payable ledger rows and currency', async () => {
  const reserved = new Set<string>();
  const records = [
    { id: 'commission-a', partnerId: partner.id, status: 'PAYABLE', currency: 'CDF', commissionAmountMinor: 2100, createdAt: new Date(1) },
    { id: 'commission-b', partnerId: partner.id, status: 'PAYABLE', currency: 'CDF', commissionAmountMinor: 900, createdAt: new Date(2) },
  ];
  const tx = {
    $queryRaw: async () => [],
    commissionLedgerEntry: { findMany: async () => records.filter((row) => !reserved.has(row.id)) },
    partnerPayout: { create: async ({ data }: { data: { partnerId: string; amountMinor: number; currency: string; commissions: { createMany: { data: Array<{ commissionEntryId: string }> } } } }) => { for (const row of data.commissions.createMany.data) reserved.add(row.commissionEntryId); return data; } },
  };
  const prisma = { partner: { findUnique: async () => partner }, $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx) } as unknown as PrismaService;
  const service = new PartnersService(prisma);
  const payout = await service.createPayout('partner-owner');
  assert.equal(payout.amountMinor, 3000);
  assert.equal(payout.currency, 'CDF');
  await assert.rejects(service.createPayout('partner-owner'), /No payable commission balance/);
});

test('payout cannot be marked paid without an external confirmation verifier', async () => {
  const service = new PartnersService({} as PrismaService);
  await assert.rejects(service.adminPayoutUpdate('finance-admin', 'payout-id', 'PAID', 'typed-but-unverified-reference'), ServiceUnavailableException);
});
