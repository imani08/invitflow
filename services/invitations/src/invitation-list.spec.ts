import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { InvitationService } from './invitation.service.js';

const cursor = '550e8400-e29b-41d4-a716-446655440000';

test('invitation history supports stable owner-scoped cursor pages', async () => {
  const calls: unknown[] = [];
  const prisma = {
    invitationBatch: {
      findFirst: async (args: unknown) => { calls.push(args); return { id: cursor }; },
      findMany: async (args: unknown) => { calls.push(args); return [{ id: cursor }, { id: '550e8400-e29b-41d4-a716-446655440001' }]; },
    },
  };
  const service = new InvitationService(prisma as never, {} as never);
  const result = await service.list('owner-subject', '550e8400-e29b-41d4-a716-446655440002', '1', cursor) as { items: { id: string }[]; nextCursor: string | null };
  assert.equal(result.items.length, 1);
  assert.equal(result.nextCursor, cursor);
  assert.deepEqual(calls[0], { where: { id: cursor, ownerSubject: 'owner-subject', eventId: '550e8400-e29b-41d4-a716-446655440002' }, select: { id: true } });
  assert.deepEqual(calls[1], {
    where: { ownerSubject: 'owner-subject', eventId: '550e8400-e29b-41d4-a716-446655440002' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 2,
    cursor: { id: cursor },
    skip: 1,
    include: { _count: { select: { items: true } } },
  });
});

test('invalid invitation page limits and cursors are rejected', async () => {
  const service = new InvitationService({} as never, {} as never);
  await assert.rejects(() => service.list('owner', undefined, '101'), BadRequestException);
  await assert.rejects(() => service.list('owner', undefined, '10', 'wrong'), BadRequestException);
});
