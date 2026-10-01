import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { AccessService } from './dist/src/access.service.js';

const eventId = 'b7f92b16-7ac6-478e-9d63-2ba52f59e110';
const ceremonyId = 'eeff8eb9-5371-4e9c-908f-b17a292c34d4';
const token = `${'a'.repeat(36)}.${'b'.repeat(43)}`;
const prisma = { checkInAgent: { findFirst: async () => ({ ceremonies: [{ ceremonyId }] }) } };
const events = { assertManageableCeremonies: async () => ({ id: eventId, name: 'Mariage', status: 'DRAFT', ceremonies: [{ id: ceremonyId, name: 'Civil' }] }), assertCeremonies: async () => ({}) };
const access = new AccessService(prisma, events);
assert.deepEqual(await access.getAgentContext('agent-subject', eventId, 'Bearer x'), {
  eventId,
  name: '',
  ceremonies: [{ id: ceremonyId, name: 'Cérémonie autorisée' }],
});
await assert.rejects(
  () => access.scan('agent', eventId, { token: 'short', ceremonyId }, 'Bearer x'),
  BadRequestException,
);
await assert.rejects(
  () => access.scan('agent', eventId, { token, ceremonyId, companionCount: 21 }, 'Bearer x'),
  BadRequestException,
);
process.stdout.write('Access service validation tests passed.\n');
