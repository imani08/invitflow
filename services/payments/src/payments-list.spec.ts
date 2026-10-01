import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';

const paymentRow = (id: string) => ({
  id,
  provider: 'mock',
  status: 'PAID',
  checkoutUrl: 'https://checkout.example.test/secret',
  providerTransactionId: `provider-${id}`,
  providerRefundId: null,
  failureCode: null,
  paidAt: new Date('2026-09-30T12:00:00Z'),
  createdAt: new Date('2026-09-30T11:00:00Z'),
  order: {
    id: `order-${id}`,
    status: 'PAID',
    packId: 'pack-id',
    packKey: 'small',
    packName: 'Petit pack',
    credits: 10,
    amountMinor: 1000,
    currency: 'CDF',
    priceScheduleVersion: 1,
    createdAt: new Date('2026-09-30T11:00:00Z'),
  },
});

test('payments list is cursor paginated and scopes cursor lookup to its owner', async () => {
  const calls: unknown[] = [];
  const db = {
    payment: {
      findFirst: async (args: unknown) => { calls.push(args); return { id: '550e8400-e29b-41d4-a716-446655440000' }; },
      findMany: async (args: unknown) => { calls.push(args); return [paymentRow('550e8400-e29b-41d4-a716-446655440000'), paymentRow('550e8400-e29b-41d4-a716-446655440001')]; },
    },
  };
  const service = new PaymentsService(db as never);
  const page = await service.list('owner-subject', '1', '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(page.items.length, 1);
  assert.equal(page.nextCursor, page.items[0]!.id);
  assert.deepEqual(calls[0], { where: { id: '550e8400-e29b-41d4-a716-446655440000', order: { ownerSubject: 'owner-subject' } }, select: { id: true } });
  assert.deepEqual(calls[1], {
    where: { order: { ownerSubject: 'owner-subject' } },
    include: { order: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 2,
    cursor: { id: '550e8400-e29b-41d4-a716-446655440000' },
    skip: 1,
  });
});

test('payments list rejects invalid limits and cursor identifiers', async () => {
  const service = new PaymentsService({} as never);
  await assert.rejects(() => service.list('owner', '101'), BadRequestException);
  await assert.rejects(() => service.list('owner', '10', 'not-a-uuid'), BadRequestException);
});
