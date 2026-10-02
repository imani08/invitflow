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

test('agency member changes are workspace scoped, audited and protect the final OWNER', async () => {
  const target = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', subject: 'member-a', role: 'MEMBER', status: 'ACTIVE' };
  let auditCount = 0;
  let ownerTarget: typeof target | null = null;
  let memberFind = async ({ where }: { where: { subject?: string; id?: string; workspaceId: string } }) => where.subject === 'owner-a' && where.workspaceId === workspaceA ? { role: 'OWNER' } : where.id === target.id && where.workspaceId === workspaceA ? target : null;
  const prisma = {
    agencyMembership: {
      findFirst: (args: { where: { subject?: string; id?: string; workspaceId: string } }) => memberFind(args),
      findMany: async () => [], count: async ({ where }: { where: { workspaceId: string; role: string; status: string } }) => where.workspaceId === workspaceA && where.role === 'OWNER' && where.status === 'ACTIVE' ? 1 : 0,
      update: async ({ data }: { data: Record<string, unknown> }) => Object.assign(target, data),
    },
    agencyAuditEntry: { create: async () => { auditCount++; return {}; } },
    $queryRaw: async () => [],
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback(prisma),
  } as unknown as PrismaService;
  const service = new EventsService(prisma);
  await service.updateAgencyMember('owner-a', workspaceA, target.id, { role: 'ADMIN' });
  assert.equal(target.role, 'ADMIN');
  assert.equal(auditCount, 1);
  await assert.rejects(service.updateAgencyMember('owner-a', workspaceB, target.id, { status: 'SUSPENDED' }), NotFoundException);
  ownerTarget = { ...target, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'OWNER', subject: 'owner-a' };
  memberFind = async ({ where }) => where.subject === 'owner-a' && where.workspaceId === workspaceA ? { role: 'OWNER' } : where.id === ownerTarget?.id && where.workspaceId === workspaceA ? ownerTarget : null;
  await assert.rejects(service.updateAgencyMember('owner-a', workspaceA, ownerTarget.id, { status: 'SUSPENDED' }), /last active agency owner/);
});

test('confirmed agency payment activates exactly its matching snapshot once and rejects bad amount or currency', async () => {
  const subscription: { id: string; workspaceId: string; planPackId: string; priceScheduleId: string; priceScheduleVersion: number; currentPlanVersion: number; periodDays: number; priceMinor: number; currency: string; status: string; paymentId: string; paymentOrderId: string; renewalOfId: string | null; workspace: { ownerSubject: string }; startsAt: Date | null; billingPeriodStart: Date | null; billingPeriodEnd: Date | null; endsAt?: Date } = { id: '55555555-5555-4555-8555-555555555555', workspaceId: workspaceA, planPackId: '66666666-6666-4666-8666-666666666666', priceScheduleId: '77777777-7777-4777-8777-777777777777', priceScheduleVersion: 4, currentPlanVersion: 4, periodDays: 30, priceMinor: 5900, currency: 'USD', status: 'PENDING', paymentId: '88888888-8888-4888-8888-888888888888', paymentOrderId: '99999999-9999-4999-8999-999999999999', renewalOfId: null, workspace: { ownerSubject: 'user-a' }, startsAt: null, billingPeriodStart: null, billingPeriodEnd: null };
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
  const paymentEvent = { orderType: 'AGENCY_SUBSCRIPTION', businessReference: subscription.id, paymentId: subscription.paymentId, orderId: subscription.paymentOrderId, customerSubject: 'user-a', providerTransactionId: 'provider-tx-1', amountMinor: 5900, currency: 'USD', metadata: { packId: subscription.planPackId, periodDays: 30, priceScheduleId: subscription.priceScheduleId, priceScheduleVersion: 4 } };
  assert.equal((await service.activateAgencySubscriptionFromPayment(paymentEvent)).activated, true);
  assert.equal(subscription.status, 'ACTIVE');
  assert.equal(subscription.billingPeriodEnd!.getTime() - subscription.billingPeriodStart!.getTime(), 30 * 86_400_000);
  assert.equal((await service.activateAgencySubscriptionFromPayment(paymentEvent)).activated, false);
  await assert.rejects(service.activateAgencySubscriptionFromPayment({ ...paymentEvent, amountMinor: 1 }));
  await assert.rejects(service.activateAgencySubscriptionFromPayment({ ...paymentEvent, currency: 'EUR' }));
});

test('confirmed renewal starts immediately with exactly 30 days and leaves old quota period unchanged', async () => {
  const oldEnd = new Date(Date.now() + 60_000);
  const previous = { id: '11111111-aaaa-4111-8111-111111111111', workspaceId: workspaceA, billingPeriodEnd: oldEnd, quotaCredits: 500, status: 'ACTIVE' };
  const next: Record<string, unknown> = { id: '22222222-aaaa-4222-8222-222222222222', workspaceId: workspaceA, planPackId: '33333333-aaaa-4333-8333-333333333333', priceScheduleId: '44444444-aaaa-4444-8444-444444444444', priceScheduleVersion: 8, currentPlanVersion: 8, periodDays: 30, quotaCredits: 1500, priceMinor: 9900, currency: 'USD', status: 'PENDING', paymentId: '55555555-aaaa-4555-8555-555555555555', paymentOrderId: '66666666-aaaa-4666-8666-666666666666', renewalOfId: previous.id, workspace: { ownerSubject: 'user-a' } };
  const prisma = { agencySubscription: {
    findFirst: async ({ where }: { where: { id: string } }) => where.id === String(next['id']) ? next : where.id === previous.id ? previous : null,
    updateMany: async ({ where, data }: { where: { status: string; paymentId: string; paymentOrderId: string }; data: Record<string, unknown> }) => {
      if (next['status'] !== where.status || next['paymentId'] !== where.paymentId || next['paymentOrderId'] !== where.paymentOrderId) return { count: 0 };
      Object.assign(next, data); return { count: 1 };
    },
    findFirstOrThrow: async () => next,
  } } as unknown as PrismaService;
  const service = new EventsService(prisma);
  const payload = { orderType: 'AGENCY_SUBSCRIPTION', businessReference: next['id'], paymentId: next['paymentId'], orderId: next['paymentOrderId'], customerSubject: 'user-a', providerTransactionId: 'tx-renewal', amountMinor: 9900, currency: 'USD', metadata: { packId: next['planPackId'], periodDays: 30, priceScheduleId: next['priceScheduleId'], priceScheduleVersion: 8 } };
  assert.equal((await service.activateAgencySubscriptionFromPayment(payload)).activated, true);
  const newStart = next['billingPeriodStart'] as Date;
  assert.ok(newStart.getTime() >= Date.now() - 1000);
  assert.ok(newStart.getTime() < oldEnd.getTime());
  assert.equal((next['billingPeriodEnd'] as Date).getTime() - newStart.getTime(), 30 * 86_400_000);
  assert.equal(previous.billingPeriodEnd, oldEnd);
  assert.equal((await service.activateAgencySubscriptionFromPayment(payload)).activated, false);
});
