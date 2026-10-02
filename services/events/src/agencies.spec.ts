import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { EventsService } from './events.service.js';
import type { PrismaService } from './prisma.service.js';

const workspaceA = '11111111-1111-4111-8111-111111111111';
const workspaceB = '22222222-2222-4222-8222-222222222222';
const clientB = '33333333-3333-4333-8333-333333333333';
const eventB = '44444444-4444-4444-8444-444444444444';

function harness() {
  const memberships = new Map([[`user-a:${workspaceA}`, 'OWNER'], [`user-b:${workspaceB}`, 'OWNER'], [`member-a:${workspaceA}`, 'MEMBER']]);
  const clients = [{ id: 'client-a', workspaceId: workspaceA }, { id: clientB, workspaceId: workspaceB }];
  const events = [{ id: 'event-a', agencyWorkspaceId: workspaceA }, { id: eventB, agencyWorkspaceId: workspaceB }];
  const prisma = {
    agencyMembership: {
      findFirst: async ({ where }: { where: { subject: string; workspaceId: string } }) => {
        const role = memberships.get(`${where.subject}:${where.workspaceId}`);
        return role ? { role } : null;
      },
      findMany: async ({ where }: { where: { subject: string } }) => [...memberships.entries()].filter(([key]) => key.startsWith(`${where.subject}:`)).map(([key, role]) => ({ workspace: { id: key.split(':')[1], name: 'Workspace', status: 'ACTIVE', subscriptions: [] }, role })),
      create: async ({ data }: { data: { workspaceId: string; subject: string; role: string } }) => { memberships.set(`${data.subject}:${data.workspaceId}`, data.role); return data; },
    },
    agencyWorkspace: { create: async ({ data }: { data: { name: string; ownerSubject: string } }) => ({ id: workspaceA, ...data, status: 'ACTIVE', createdAt: new Date() }) },
    agencyClient: {
      findMany: async ({ where }: { where: { workspaceId: string } }) => clients.filter((client) => client.workspaceId === where.workspaceId),
      findFirst: async ({ where }: { where: { id: string; workspaceId: string } }) => clients.find((client) => client.id === where.id && client.workspaceId === where.workspaceId) ?? null,
      create: async ({ data }: { data: { workspaceId: string; name: string } }) => ({ id: 'new-client', ...data }),
      count: async ({ where }: { where: { workspaceId: string } }) => clients.filter((client) => client.workspaceId === where.workspaceId).length,
    },
    event: {
      findMany: async ({ where }: { where: { agencyWorkspaceId: string } }) => events.filter((event) => event.agencyWorkspaceId === where.agencyWorkspaceId) as unknown as Awaited<ReturnType<PrismaService['event']['findMany']>>,
      findFirst: async ({ where }: { where: { id: string; agencyWorkspaceId: string } }) => events.find((event) => event.id === where.id && event.agencyWorkspaceId === where.agencyWorkspaceId) ?? null,
      count: async ({ where }: { where: { agencyWorkspaceId: string } }) => events.filter((event) => event.agencyWorkspaceId === where.agencyWorkspaceId).length,
      create: async ({ data }: { data: { agencyWorkspaceId: string } }) => ({ id: 'new-event', ...data, createdAt: new Date(), name: 'Event', eventType: 'WEDDING' }),
    },
    agencyClientEvent: { create: async ({ data }: { data: unknown }) => data },
    agencyQuotaReservation: { aggregate: async () => ({ _sum: { credits: 0 } }) },
    agencySubscription: { findMany: async () => [] },
    outboxMessage: { create: async ({ data }: { data: unknown }) => data },
    $transaction: async <T>(callback: (tx: Record<string, unknown>) => Promise<T>) => callback(prisma as unknown as Record<string, unknown>),
  };
  return { service: new EventsService(prisma as unknown as PrismaService), prisma, memberships };
}

test('agency member A sees only workspace A clients and events', async () => {
  const { service } = harness();
  assert.deepEqual((await service.agencyClients('user-a', workspaceA)).map((row) => row.workspaceId), [workspaceA]);
  assert.deepEqual((await service.agencyEvents('user-a', workspaceA)).map((row) => (row as unknown as { agencyWorkspaceId: string }).agencyWorkspaceId), [workspaceA]);
});

test('user A cannot access workspace B or fetch a resource there by direct ID', async () => {
  const { service } = harness();
  await assert.rejects(service.agencyClients('user-a', workspaceB), NotFoundException);
  await assert.rejects(service.agencyEventDetail('user-a', workspaceA, eventB), NotFoundException);
  await assert.rejects(service.createAgencyClient('user-a', workspaceB, { name: 'Cross tenant' }), NotFoundException);
});

test('agency member roles permit reads but deny member administration', async () => {
  const { service } = harness();
  assert.equal((await service.agencyMembers('member-a', workspaceA)).length, 0);
  await assert.rejects(service.addAgencyMember('member-a', workspaceA, 'person-c', 'MEMBER'));
  await service.addAgencyMember('user-a', workspaceA, 'person-c', 'MEMBER');
});

test('confirmed agency payment activates exactly its matching snapshot once and rejects bad amount or currency', async () => {
  const subscription = { id: '55555555-5555-4555-8555-555555555555', workspaceId: workspaceA, planPackId: '66666666-6666-4666-8666-666666666666', priceScheduleId: '77777777-7777-4777-8777-777777777777', priceScheduleVersion: 4, priceMinor: 5900, currency: 'USD', status: 'PENDING', paymentId: '88888888-8888-4888-8888-888888888888', paymentOrderId: '99999999-9999-4999-8999-999999999999', workspace: { ownerSubject: 'user-a' }, startsAt: null, billingPeriodStart: null };
  const prisma = {
    agencySubscription: {
      findFirst: async () => subscription,
      updateMany: async ({ where, data }: { where: { status: string; paymentId: string; paymentOrderId: string }; data: Record<string, unknown> }) => {
        if (subscription.status !== where.status || subscription.paymentId !== where.paymentId || subscription.paymentOrderId !== where.paymentOrderId) return { count: 0 };
        Object.assign(subscription, data); return { count: 1 };
      },
      findFirstOrThrow: async () => subscription,
    },
  } as unknown as PrismaService;
  const service = new EventsService(prisma);
  const paymentEvent = { orderType: 'AGENCY_SUBSCRIPTION', businessReference: subscription.id, paymentId: subscription.paymentId, orderId: subscription.paymentOrderId, customerSubject: 'user-a', providerTransactionId: 'provider-tx-1', amountMinor: 5900, currency: 'USD', metadata: { packId: subscription.planPackId, priceScheduleId: subscription.priceScheduleId, priceScheduleVersion: 4 } };
  assert.equal((await service.activateAgencySubscriptionFromPayment(paymentEvent)).activated, true);
  assert.equal(subscription.status, 'ACTIVE');
  assert.equal((await service.activateAgencySubscriptionFromPayment(paymentEvent)).activated, false);
  await assert.rejects(service.activateAgencySubscriptionFromPayment({ ...paymentEvent, amountMinor: 1 }));
  await assert.rejects(service.activateAgencySubscriptionFromPayment({ ...paymentEvent, currency: 'EUR' }));
});
