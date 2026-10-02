import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgencyMemberStatus, AgencyWorkspaceStatus, CeremonyStatus, EventStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';
import type { CeremonyFields, CreateCeremonyFields, CreateEventFields, EventFields } from './events.types.js';

const eventSelect = {
  id: true, name: true, description: true, eventType: true, status: true, startAt: true, endAt: true, timezone: true, agencyWorkspaceId: true,
  createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async agencyDashboard(subject: string) {
    const memberships = await this.prisma.agencyMembership.findMany({
      where: { subject, status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'asc' },
      include: { workspace: { include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    });
    return Promise.all(memberships.map(async ({ workspace, role }) => {
      const [clients, events, consumed, reserved] = await Promise.all([
        this.prisma.agencyClient.count({ where: { workspaceId: workspace.id } }),
        this.prisma.event.count({ where: { agencyWorkspaceId: workspace.id } }),
        this.prisma.agencyQuotaReservation.aggregate({ where: { workspaceId: workspace.id, status: 'CONSUMED' }, _sum: { credits: true } }),
        this.prisma.agencyQuotaReservation.aggregate({ where: { workspaceId: workspace.id, status: 'RESERVED' }, _sum: { credits: true } }),
      ]);
      return { id: workspace.id, name: workspace.name, status: workspace.status, role, plan: workspace.subscriptions[0] ?? null,
        usage: { consumed: consumed._sum.credits ?? 0, reserved: reserved._sum.credits ?? 0 }, clients, events };
    }));
  }

  async createAgency(subject: string, name: string) {
    const cleaned = name.trim();
    if (cleaned.length < 2 || cleaned.length > 120) throw new BadRequestException('Agency name must contain 2 to 120 characters');
    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.agencyWorkspace.create({ data: { name: cleaned, ownerSubject: subject, memberships: { create: { subject, role: 'OWNER', addedBy: subject } } } });
      await tx.outboxMessage.create({ data: { eventType: 'agencies.workspace.created.v1', aggregateId: workspace.id, payload: { workspaceId: workspace.id, ownerSubject: subject, occurredAt: workspace.createdAt.toISOString(), schemaVersion: 1 } } });
      return workspace;
    });
  }

  async agencyMembers(subject: string, workspaceId: string) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN', 'MEMBER']);
    return this.prisma.agencyMembership.findMany({ where: { workspaceId }, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }], select: { id: true, subject: true, role: true, status: true, createdAt: true } });
  }

  async addAgencyMember(subject: string, workspaceId: string, memberSubject: string, role: 'ADMIN' | 'MEMBER') {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN']);
    if (memberSubject === subject) throw new BadRequestException('An owner cannot invite themselves as a member');
    try {
      return await this.prisma.agencyMembership.create({ data: { workspaceId, subject: memberSubject, role, addedBy: subject }, select: { id: true, subject: true, role: true, status: true, createdAt: true } });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException('This person is already a member');
      throw error;
    }
  }

  async agencyClients(subject: string, workspaceId: string) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN', 'MEMBER']);
    return this.prisma.agencyClient.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  }

  async createAgencyClient(subject: string, workspaceId: string, input: { name: string; email?: string | null; phone?: string | null }) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN', 'MEMBER']);
    const name = input.name.trim();
    if (name.length < 2 || name.length > 120 || (input.email != null && (input.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))) || (input.phone != null && input.phone.length > 40)) throw new BadRequestException('Client details are invalid');
    return this.prisma.agencyClient.create({ data: { workspaceId, name, email: input.email?.trim() || null, phone: input.phone?.trim() || null, createdBy: subject } });
  }

  async removeAgencyClient(subject: string, workspaceId: string, clientId: string) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN']);
    const deleted = await this.prisma.agencyClient.deleteMany({ where: { id: clientId, workspaceId } });
    if (!deleted.count) throw new NotFoundException('Agency client not found');
    return { deleted: true };
  }

  async agencyEvents(subject: string, workspaceId: string) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN', 'MEMBER']);
    return this.prisma.event.findMany({ where: { agencyWorkspaceId: workspaceId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, name: true, eventType: true, status: true, startAt: true, createdAt: true, agencyClientEvents: { select: { clientId: true } } } });
  }

  async createAgencyEvent(subject: string, workspaceId: string, clientId: string, input: CreateEventFields) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN', 'MEMBER']);
    return this.prisma.$transaction(async (tx) => {
      const client = await tx.agencyClient.findFirst({ where: { id: clientId, workspaceId }, select: { id: true } });
      if (!client) throw new NotFoundException('Agency client not found');
      const event = await tx.event.create({ data: { ...input, ownerSubject: subject, agencyWorkspaceId: workspaceId }, select: eventSelect });
      await tx.agencyClientEvent.create({ data: { workspaceId, clientId, eventId: event.id } });
      await tx.outboxMessage.create({ data: { eventType: 'events.created.v1', aggregateId: event.id, payload: { id: event.id, ownerSubject: subject, agencyWorkspaceId: workspaceId, clientId, name: event.name, eventType: event.eventType, occurredAt: event.createdAt.toISOString(), schemaVersion: 1 } } });
      return { ...event, ceremonies: [] };
    });
  }

  async createAgencySubscription(subject: string, workspaceId: string, catalog: unknown, planKey: string) {
    const member = await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN']);
    if (member.role !== 'OWNER') throw new ForbiddenException('Only the agency owner can change its plan');
    if (!catalog || typeof catalog !== 'object' || !('scheduleId' in catalog) || !('version' in catalog) || !('packs' in catalog) || !Array.isArray(catalog.packs)) throw new BadRequestException('Agency pricing catalog is unavailable');
    const value = catalog as { scheduleId: string; version: number; packs: Array<{ id: string; key: string; name: string; credits: number; priceMinor: number; currency: string; segment: string }> };
    const pack = value.packs.find((candidate) => candidate.key === planKey && candidate.segment === 'AGENCY');
    if (!pack || !Number.isSafeInteger(value.version) || !/^[0-9a-f-]{36}$/i.test(value.scheduleId)) throw new BadRequestException('Select a currently published agency plan');
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.agencySubscription.findFirst({ where: { workspaceId, planPackId: pack.id, priceScheduleId: value.scheduleId, status: 'PENDING', paymentId: null }, orderBy: { createdAt: 'desc' } });
      if (existing) return existing;
      await tx.agencySubscription.updateMany({ where: { workspaceId, status: 'PENDING' }, data: { status: 'CANCELLED', endsAt: new Date() } });
      return tx.agencySubscription.create({ data: { workspaceId, planPackId: pack.id, planKey: pack.key, planName: pack.name, quotaCredits: pack.credits, priceMinor: pack.priceMinor, currency: pack.currency, priceScheduleId: value.scheduleId, priceScheduleVersion: value.version, status: 'PENDING' } });
    });
  }

  async attachAgencyCheckout(subject: string, workspaceId: string, subscriptionId: string, orderId: string, paymentId: string) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER']);
    const changed = await this.prisma.agencySubscription.updateMany({ where: { id: subscriptionId, workspaceId, status: 'PENDING', paymentId: null, paymentOrderId: null, workspace: { ownerSubject: subject } }, data: { paymentOrderId: orderId, paymentId } });
    if (!changed.count) {
      const existing = await this.prisma.agencySubscription.findFirst({ where: { id: subscriptionId, workspaceId, status: 'PENDING', paymentId, paymentOrderId: orderId }, select: { id: true } });
      if (!existing) throw new ConflictException('Agency checkout was already attached to a different payment');
    }
    return this.prisma.agencySubscription.findFirstOrThrow({ where: { id: subscriptionId, workspaceId } });
  }

  async reserveAgencyQuota(subject: string, workspaceId: string, eventId: string, referenceKey: string, credits: number, allowPartial = false) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN', 'MEMBER']);
    this.assertUuid(eventId);
    if (!/^[A-Za-z0-9._:@/-]{1,200}$/.test(referenceKey) || !Number.isSafeInteger(credits) || credits < 1 || credits > 5000) throw new BadRequestException('Agency quota reservation is invalid');
    const prior = await this.prisma.agencyQuotaReservation.findUnique({ where: { referenceKey } });
      if (prior) {
        if (prior.workspaceId !== workspaceId || prior.eventId !== eventId || prior.credits !== credits || prior.status === 'RELEASED') throw new ConflictException('Quota reservation reference was already used');
        return { ...prior, remaining: await this.agencyQuotaRemaining(workspaceId, prior.subscriptionId), reservedCredits: prior.credits };
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await tx.event.findFirst({ where: { id: eventId, agencyWorkspaceId: workspaceId }, select: { id: true } });
        if (!event) throw new NotFoundException('Agency event not found');
        const subscription = await tx.agencySubscription.findFirst({ where: { workspaceId, status: 'ACTIVE', startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' } });
        if (!subscription) throw new BadRequestException('Aucune souscription agence active. Changez de plan pour générer des invitations.');
        await tx.$queryRaw`SELECT "id" FROM "agency_subscriptions" WHERE "id" = ${subscription.id}::uuid FOR UPDATE`;
        const duplicate = await tx.agencyQuotaReservation.findUnique({ where: { referenceKey } });
        if (duplicate) {
            if (duplicate.subscriptionId !== subscription.id || duplicate.workspaceId !== workspaceId || duplicate.eventId !== eventId || (allowPartial ? duplicate.credits > credits : duplicate.credits !== credits) || duplicate.status === 'RELEASED') throw new ConflictException('Quota reservation reference was already used');
            return { ...duplicate, remaining: await this.agencyQuotaRemaining(workspaceId, subscription.id, tx), reservedCredits: duplicate.credits };
        }
        const usage = await tx.agencyQuotaReservation.aggregate({ where: { subscriptionId: subscription.id, status: { in: ['CONSUMED', 'RESERVED'] } }, _sum: { credits: true } });
        const usedAndReserved = usage._sum.credits ?? 0;
        const remaining = Math.max(0, subscription.quotaCredits - usedAndReserved);
          if (credits > remaining && !allowPartial) throw new BadRequestException(`Quota agence insuffisant: ${remaining} invitation(s) disponible(s). Changez de plan ou achetez des crédits supplémentaires.`);
          const reservedCredits = Math.min(credits, remaining);
          if (reservedCredits === 0) return { id: null, subscriptionId: subscription.id, workspaceId, eventId, referenceKey, credits: 0, status: 'RELEASED', remaining, reservedCredits: 0 };
          const reservation = await tx.agencyQuotaReservation.create({ data: { subscriptionId: subscription.id, workspaceId, eventId, referenceKey, credits: reservedCredits, status: 'RESERVED' } });
          await tx.outboxMessage.create({ data: { eventType: 'agencies.quota.reserved.v1', aggregateId: subscription.id, payload: { workspaceId, eventId, reservationId: reservation.id, referenceKey, credits: reservedCredits, remaining: remaining - reservedCredits, subject, occurredAt: new Date().toISOString(), schemaVersion: 1 } } });
          return { ...reservation, remaining: remaining - reservedCredits, reservedCredits };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        const raced = await this.prisma.agencyQuotaReservation.findUnique({ where: { referenceKey } });
          if (raced && raced.workspaceId === workspaceId && raced.eventId === eventId && (allowPartial ? raced.credits <= credits : raced.credits === credits) && raced.status !== 'RELEASED') return { ...raced, remaining: await this.agencyQuotaRemaining(workspaceId, raced.subscriptionId), reservedCredits: raced.credits };
      }
      throw error;
    }
  }

  async agencyQuotaSummary(subject: string, workspaceId: string) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN', 'MEMBER']);
    const subscription = await this.prisma.agencySubscription.findFirst({ where: { workspaceId, status: 'ACTIVE', startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, orderBy: { createdAt: 'desc' } });
    if (!subscription) return { subscriptionId: null, includedQuota: 0, consumed: 0, reserved: 0, remaining: 0 };
    const [consumed, reserved] = await Promise.all([
      this.prisma.agencyQuotaReservation.aggregate({ where: { subscriptionId: subscription.id, status: 'CONSUMED' }, _sum: { credits: true } }),
      this.prisma.agencyQuotaReservation.aggregate({ where: { subscriptionId: subscription.id, status: 'RESERVED' }, _sum: { credits: true } }),
    ]);
    const consumedCredits = consumed._sum.credits ?? 0;
    const reservedCredits = reserved._sum.credits ?? 0;
    return { subscriptionId: subscription.id, includedQuota: subscription.quotaCredits, consumed: consumedCredits, reserved: reservedCredits, remaining: Math.max(0, subscription.quotaCredits - consumedCredits - reservedCredits) };
  }

  async finalizeAgencyQuotaReservation(subject: string, workspaceId: string, referenceKey: string, finalStatus: 'CONSUMED' | 'RELEASED', consumedCredits?: number, internal = false) {
    if (!internal) await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN', 'MEMBER']);
    const current = await this.prisma.agencyQuotaReservation.findUnique({ where: { referenceKey } });
    if (!current || current.workspaceId !== workspaceId) throw new NotFoundException('Agency quota reservation not found');
    const finalCredits = finalStatus === 'CONSUMED' ? (consumedCredits ?? current.credits) : 0;
    if (!Number.isSafeInteger(finalCredits) || finalCredits < 0 || finalCredits > current.credits) throw new BadRequestException('Consumed quota amount is invalid');
    const actualStatus = finalCredits === 0 ? 'RELEASED' : finalStatus;
    if (current.status === actualStatus && (actualStatus !== 'CONSUMED' || current.credits === finalCredits)) return current;
    if (current.status !== 'RESERVED') throw new ConflictException('Agency quota reservation is already finalized');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "agency_quota_reservations" WHERE "id" = ${current.id}::uuid FOR UPDATE`;
      const changed = await tx.agencyQuotaReservation.updateMany({ where: { id: current.id, workspaceId, status: 'RESERVED' }, data: { status: actualStatus, ...(actualStatus === 'CONSUMED' ? { credits: finalCredits } : {}) } });
      if (!changed.count) {
        const latest = await tx.agencyQuotaReservation.findUnique({ where: { referenceKey } });
        if (latest?.status === actualStatus && (actualStatus !== 'CONSUMED' || latest.credits === finalCredits)) return latest;
        throw new ConflictException('Agency quota reservation changed concurrently');
      }
      await tx.outboxMessage.create({ data: { eventType: actualStatus === 'CONSUMED' ? 'agencies.quota.consumed.v1' : 'agencies.quota.released.v1', aggregateId: current.subscriptionId ?? workspaceId, payload: { workspaceId, eventId: current.eventId, reservationId: current.id, referenceKey, credits: actualStatus === 'CONSUMED' ? finalCredits : current.credits, subject, occurredAt: new Date().toISOString(), schemaVersion: 1 } } });
      return tx.agencyQuotaReservation.findUniqueOrThrow({ where: { referenceKey } });
    });
  }

  private async agencyQuotaRemaining(workspaceId: string, subscriptionId: string | null, tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    if (!subscriptionId) return 0;
    const subscription = await tx.agencySubscription.findFirst({ where: { id: subscriptionId, workspaceId }, select: { quotaCredits: true } });
    if (!subscription) return 0;
    const usage = await tx.agencyQuotaReservation.aggregate({ where: { subscriptionId, status: { in: ['CONSUMED', 'RESERVED'] } }, _sum: { credits: true } });
    return Math.max(0, subscription.quotaCredits - (usage._sum.credits ?? 0));
  }

  async activateAgencySubscriptionFromPayment(raw: unknown) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Payment event payload is invalid');
    const event = raw as Record<string, unknown>;
    const metadata = event['metadata'];
    if (event['orderType'] !== 'AGENCY_SUBSCRIPTION' || typeof event['businessReference'] !== 'string' || typeof event['paymentId'] !== 'string' || typeof event['orderId'] !== 'string' || typeof event['customerSubject'] !== 'string' || typeof event['providerTransactionId'] !== 'string' || !event['providerTransactionId'] || !Number.isSafeInteger(event['amountMinor']) || typeof event['currency'] !== 'string' || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new BadRequestException('Payment event does not describe a valid agency subscription');
    const snapshot = metadata as Record<string, unknown>;
    const subscriptionId = event['businessReference'];
    const subscription = await this.prisma.agencySubscription.findFirst({ where: { id: subscriptionId, workspace: { ownerSubject: event['customerSubject'] } } });
    if (!subscription || subscription.planPackId !== snapshot['packId'] || subscription.priceScheduleId !== snapshot['priceScheduleId'] || subscription.priceScheduleVersion !== snapshot['priceScheduleVersion'] || subscription.priceMinor !== event['amountMinor'] || subscription.currency.trim() !== event['currency']) throw new ConflictException('Confirmed payment does not match the agency subscription snapshot');
    if (subscription.status === 'ACTIVE' && subscription.paymentId === event['paymentId'] && subscription.paymentOrderId === event['orderId']) return { activated: false, subscription };
    if (subscription.status !== 'PENDING' || subscription.paymentId !== event['paymentId'] || subscription.paymentOrderId !== event['orderId']) throw new ConflictException('Payment does not match the pending agency checkout');
    const startedAt = new Date();
    const changed = await this.prisma.agencySubscription.updateMany({ where: { id: subscription.id, status: 'PENDING', paymentId: event['paymentId'], paymentOrderId: event['orderId'] }, data: { status: 'ACTIVE', startsAt: startedAt, billingPeriodStart: startedAt } });
    if (!changed.count) {
      const active = await this.prisma.agencySubscription.findFirst({ where: { id: subscription.id, status: 'ACTIVE', paymentId: event['paymentId'], paymentOrderId: event['orderId'] } });
      if (!active) throw new ConflictException('Agency subscription activation raced with another update');
      return { activated: false, subscription: active };
    }
    return { activated: true, subscription: await this.prisma.agencySubscription.findFirstOrThrow({ where: { id: subscription.id } }) };
  }

  async agencyEventDetail(subject: string, workspaceId: string, eventId: string) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN', 'MEMBER']);
    const event = await this.prisma.event.findFirst({ where: { id: eventId, agencyWorkspaceId: workspaceId }, select: { ...eventSelect, ceremonies: { orderBy: { startAt: 'asc' }, include: { programItems: { orderBy: { position: 'asc' } } } } } });
    if (!event) throw new NotFoundException('Agency event not found');
    return event;
  }

  private async requireAgencyRole(subject: string, workspaceId: string, roles: Array<'OWNER' | 'ADMIN' | 'MEMBER'>) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) throw new NotFoundException('Agency not found');
    const membership = await this.prisma.agencyMembership.findFirst({ where: { subject, workspaceId, status: 'ACTIVE', workspace: { status: 'ACTIVE' } }, select: { role: true } });
    if (!membership) throw new NotFoundException('Agency not found');
    if (!roles.includes(membership.role)) throw new ForbiddenException('Insufficient agency permissions');
    return membership;
  }

  create(ownerSubject: string, data: CreateEventFields) {
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({ data: { ...data, ownerSubject }, select: eventSelect });
      await tx.outboxMessage.create({ data: {
        eventType: 'events.created.v1', aggregateId: event.id,
        payload: { id: event.id, ownerSubject, name: event.name, eventType: event.eventType, occurredAt: event.createdAt.toISOString(), schemaVersion: 1 },
      } });
      return { ...event, ceremonies: [] };
    });
  }

  async list(ownerSubject: string, limit: number, cursor?: string, workspaceOnly = false) {
    const scope: Prisma.EventWhereInput = workspaceOnly
      ? { agencyWorkspace: { is: { status: AgencyWorkspaceStatus.ACTIVE, memberships: { some: { subject: ownerSubject, status: AgencyMemberStatus.ACTIVE } } } } }
      : { ownerSubject };
    if (cursor) {
      const ownedCursor = await this.prisma.event.findFirst({ where: { id: cursor, ...scope }, select: { id: true } });
      if (!ownedCursor) throw new NotFoundException('Event not found');
    }
    const rows = await this.prisma.event.findMany({
      where: scope,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { ...eventSelect, ceremonies: { orderBy: { startAt: 'asc' }, include: { programItems: { orderBy: { position: 'asc' } } } }, _count: { select: { ceremonies: true } } },
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return { items: page.map(({ _count, ...event }) => ({ ...event, ceremonyCount: _count.ceremonies })), nextCursor: hasMore ? page.at(-1)?.id ?? null : null };
  }

  async get(ownerSubject: string, id: string, allowAgencyMember = false) {
    this.assertUuid(id);
    const event = await this.prisma.event.findFirst({ where: { id, OR: [{ ownerSubject, agencyWorkspaceId: null }, ...(allowAgencyMember ? [{ agencyWorkspace: { is: { status: AgencyWorkspaceStatus.ACTIVE, memberships: { some: { subject: ownerSubject, status: AgencyMemberStatus.ACTIVE } } } } }] : [])] }, select: { ...eventSelect, ceremonies: { orderBy: { startAt: 'asc' }, include: { programItems: { orderBy: { position: 'asc' } } } } } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async update(ownerSubject: string, id: string, data: EventFields) {
    this.assertUuid(id);
    await this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, id);
      if (!event) throw new NotFoundException('Event not found');
      if (event.status !== EventStatus.DRAFT) throw new BadRequestException('Only draft events can be edited');
      const nextStart = data.startAt === undefined ? event.startAt : data.startAt;
      const nextEnd = data.endAt === undefined ? event.endAt : data.endAt;
      if (nextStart && nextEnd && nextEnd <= nextStart) throw new BadRequestException('endAt must be after startAt');
      const existingCeremonies = await tx.ceremony.findMany({ where: { eventId: id }, select: { startAt: true, endAt: true } });
      if (nextStart && existingCeremonies.some((ceremony) => ceremony.startAt < nextStart)) throw new BadRequestException('Event startAt cannot be after an existing ceremony');
      if (nextEnd && existingCeremonies.some((ceremony) => ceremony.startAt > nextEnd || (ceremony.endAt && ceremony.endAt > nextEnd))) throw new BadRequestException('Event endAt cannot be before an existing ceremony');
      const result = await tx.event.updateMany({ where: { id, ownerSubject, status: EventStatus.DRAFT }, data });
      if (!result.count) throw new ConflictException('Event status changed; reload before editing');
      await tx.outboxMessage.create({ data: {
        eventType: 'events.updated.v1', aggregateId: id,
        payload: { id, ownerSubject, changedFields: Object.keys(data), occurredAt: new Date().toISOString(), schemaVersion: 1 },
      } });
    });
    return this.get(ownerSubject, id);
  }

  async publish(ownerSubject: string, id: string) {
    this.assertUuid(id);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, id);
      if (!event) throw new NotFoundException('Event not found');
      if (event.status === EventStatus.PUBLISHED) return tx.event.findFirst({ where: { id, ownerSubject }, select: { ...eventSelect, ceremonies: { include: { programItems: { orderBy: { position: 'asc' } } } } } });
      if (event.status !== EventStatus.DRAFT) throw new BadRequestException('Only draft events can be published');
      const scheduled = await tx.ceremony.count({ where: { eventId: id, status: CeremonyStatus.SCHEDULED } });
      if (scheduled === 0) throw new BadRequestException('Add at least one scheduled ceremony before publishing');
      const transition = await tx.event.updateMany({ where: { id, ownerSubject, status: EventStatus.DRAFT }, data: { status: EventStatus.PUBLISHED } });
      if (transition.count !== 1) throw new ConflictException('Event status changed; reload before publishing');
      const updated = await tx.event.findFirstOrThrow({ where: { id, ownerSubject }, select: eventSelect });
      await tx.outboxMessage.create({ data: {
        eventType: 'events.published.v1', aggregateId: id,
        payload: { id, ownerSubject, name: updated.name, occurredAt: new Date().toISOString(), schemaVersion: 1 },
      } });
      return tx.event.findFirstOrThrow({ where: { id, ownerSubject }, select: { ...eventSelect, ceremonies: { orderBy: { startAt: 'asc' }, include: { programItems: { orderBy: { position: 'asc' } } } } } });
    });
  }

  async cancel(ownerSubject: string, id: string) {
    this.assertUuid(id);
    const event = await this.prisma.event.findFirst({ where: { id, ownerSubject }, select: { ...eventSelect } });
    if (!event) throw new NotFoundException('Event not found');
    if (event.status === EventStatus.CANCELLED) return this.get(ownerSubject, id);
    if (event.status === EventStatus.COMPLETED) throw new BadRequestException('Completed events cannot be cancelled');
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.event.updateMany({ where: { id, ownerSubject, status: event.status }, data: { status: EventStatus.CANCELLED } });
      if (result.count) {
        await tx.ceremony.updateMany({ where: { eventId: id, status: CeremonyStatus.SCHEDULED }, data: { status: CeremonyStatus.CANCELLED } });
        await tx.outboxMessage.create({ data: {
          eventType: 'events.cancelled.v1', aggregateId: id,
          payload: { id, ownerSubject, occurredAt: new Date().toISOString(), schemaVersion: 1 },
        } });
      }
    });
    return this.get(ownerSubject, id);
  }

  async addCeremony(ownerSubject: string, eventId: string, data: CreateCeremonyFields) {
    this.assertUuid(eventId);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, eventId);
      if (!event) throw new NotFoundException('Event not found');
      if (event.status !== EventStatus.DRAFT) throw new BadRequestException('Ceremonies can only be added to draft events');
      this.checkEventWindow(event, data.startAt as Date, data.endAt instanceof Date ? data.endAt : null);
      const ceremony = await tx.ceremony.create({ data: { ...data, eventId } });
      await tx.outboxMessage.create({ data: {
        eventType: 'events.ceremony.created.v1', aggregateId: eventId,
        payload: { eventId, ceremonyId: ceremony.id, ownerSubject, ceremonyType: ceremony.ceremonyType, occurredAt: ceremony.createdAt.toISOString(), schemaVersion: 1 },
      } });
      return ceremony;
    });
  }

  async updateCeremony(ownerSubject: string, eventId: string, ceremonyId: string, data: CeremonyFields) {
    this.assertUuid(eventId); this.assertUuid(ceremonyId);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, eventId);
      if (!event) throw new NotFoundException('Event not found');
      if (event.status !== EventStatus.DRAFT) throw new BadRequestException('Ceremonies can only be edited while the event is draft');
      const current = await tx.ceremony.findFirst({ where: { id: ceremonyId, eventId }, select: { id: true, startAt: true, endAt: true, status: true } });
      if (!current) throw new NotFoundException('Ceremony not found');
      const startAt = data.startAt instanceof Date ? data.startAt : current.startAt;
      const endAt = data.endAt === null ? null : data.endAt instanceof Date ? data.endAt : current.endAt;
      if (endAt && endAt <= startAt) throw new BadRequestException('endAt must be after startAt');
      this.checkEventWindow(event, startAt, endAt);
      const result = await tx.ceremony.updateMany({ where: { id: ceremonyId, eventId }, data });
      if (!result.count) throw new NotFoundException('Ceremony not found');
      await tx.outboxMessage.create({ data: {
        eventType: 'events.ceremony.updated.v1', aggregateId: eventId,
        payload: { eventId, ceremonyId, ownerSubject, changedFields: Object.keys(data), occurredAt: new Date().toISOString(), schemaVersion: 1 },
      } });
      return tx.ceremony.findFirst({ where: { id: ceremonyId, eventId } });
    });
  }

  async removeCeremony(ownerSubject: string, eventId: string, ceremonyId: string) {
    this.assertUuid(eventId); this.assertUuid(ceremonyId);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, eventId);
      if (!event) throw new NotFoundException('Event not found');
      if (event.status !== EventStatus.DRAFT) throw new BadRequestException('Ceremonies can only be removed while the event is draft');
      const result = await tx.ceremony.deleteMany({ where: { id: ceremonyId, eventId } });
      if (!result.count) throw new NotFoundException('Ceremony not found');
      await tx.outboxMessage.create({ data: {
        eventType: 'events.ceremony.deleted.v1', aggregateId: eventId,
        payload: { eventId, ceremonyId, ownerSubject, occurredAt: new Date().toISOString(), schemaVersion: 1 },
      } });
      return { deleted: true };
    });
  }

  async addProgramItem(ownerSubject: string, eventId: string, ceremonyId: string, data: { title: string; description?: string | null; startsAt?: Date | null; durationMinutes?: number | null; location?: string | null }) {
    this.assertUuid(eventId); this.assertUuid(ceremonyId);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, eventId);
      if (!event) throw new NotFoundException('Event not found');
      if (event.status !== EventStatus.DRAFT) throw new BadRequestException('Program can only be edited while the event is draft');
      const ceremony = await tx.ceremony.findFirst({ where: { id: ceremonyId, eventId }, select: { id: true } });
      if (!ceremony) throw new NotFoundException('Ceremony not found');
      const existing = await tx.ceremonyProgramItem.findMany({ where: { ceremonyId }, select: { position: true } });
      if (existing.length >= 50) throw new BadRequestException('A ceremony program can contain at most 50 steps');
      const position = existing.reduce((maximum, item) => Math.max(maximum, item.position), -1) + 1;
      const item = await tx.ceremonyProgramItem.create({ data: { ceremonyId, position, ...data } });
      await tx.outboxMessage.create({ data: { eventType: 'events.ceremony.program-item.created.v1', aggregateId: eventId, payload: { eventId, ceremonyId, itemId: item.id, position, ownerSubject, occurredAt: item.createdAt.toISOString(), schemaVersion: 1 } } });
      return item;
    });
  }

  async updateProgramItem(ownerSubject: string, eventId: string, ceremonyId: string, itemId: string, data: { title?: string; description?: string | null; startsAt?: Date | null; durationMinutes?: number | null; location?: string | null }) {
    this.assertUuid(eventId); this.assertUuid(ceremonyId); this.assertUuid(itemId);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, eventId);
      if (!event) throw new NotFoundException('Event not found');
      if (event.status !== EventStatus.DRAFT) throw new BadRequestException('Program can only be edited while the event is draft');
      const result = await tx.ceremonyProgramItem.updateMany({ where: { id: itemId, ceremonyId, ceremony: { eventId } }, data });
      if (!result.count) throw new NotFoundException('Program item not found');
      await tx.outboxMessage.create({ data: { eventType: 'events.ceremony.program-item.updated.v1', aggregateId: eventId, payload: { eventId, ceremonyId, itemId, ownerSubject, changedFields: Object.keys(data), occurredAt: new Date().toISOString(), schemaVersion: 1 } } });
      return tx.ceremonyProgramItem.findFirstOrThrow({ where: { id: itemId, ceremonyId } });
    });
  }

  async reorderProgramItems(ownerSubject: string, eventId: string, ceremonyId: string, itemIds: string[]) {
    this.assertUuid(eventId); this.assertUuid(ceremonyId);
    if (itemIds.length > 50 || new Set(itemIds).size !== itemIds.length || itemIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) throw new BadRequestException('Program order is invalid');
    return this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, eventId);
      if (!event) throw new NotFoundException('Event not found');
      if (event.status !== EventStatus.DRAFT) throw new BadRequestException('Program can only be edited while the event is draft');
      const current = await tx.ceremonyProgramItem.findMany({ where: { ceremonyId, ceremony: { eventId } }, orderBy: { position: 'asc' }, select: { id: true } });
      if (current.length !== itemIds.length || current.some((item) => !itemIds.includes(item.id))) throw new BadRequestException('Reload the ceremony program before reordering');
      for (const [position, id] of itemIds.entries()) {
        const changed = await tx.ceremonyProgramItem.updateMany({ where: { id, ceremonyId }, data: { position } });
        if (changed.count !== 1) throw new NotFoundException('Program item not found');
      }
      await tx.outboxMessage.create({ data: { eventType: 'events.ceremony.program-reordered.v1', aggregateId: eventId, payload: { eventId, ceremonyId, itemIds, ownerSubject, occurredAt: new Date().toISOString(), schemaVersion: 1 } } });
      return { items: await tx.ceremonyProgramItem.findMany({ where: { ceremonyId }, orderBy: { position: 'asc' } }) };
    });
  }

  async removeProgramItem(ownerSubject: string, eventId: string, ceremonyId: string, itemId: string) {
    this.assertUuid(eventId); this.assertUuid(ceremonyId); this.assertUuid(itemId);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, eventId);
      if (!event) throw new NotFoundException('Event not found');
      if (event.status !== EventStatus.DRAFT) throw new BadRequestException('Program can only be edited while the event is draft');
      const item = await tx.ceremonyProgramItem.findFirst({ where: { id: itemId, ceremonyId, ceremony: { eventId } }, select: { id: true } });
      if (!item) throw new NotFoundException('Program item not found');
      await tx.ceremonyProgramItem.delete({ where: { id: itemId } });
      await tx.outboxMessage.create({ data: { eventType: 'events.ceremony.program-item.deleted.v1', aggregateId: eventId, payload: { eventId, ceremonyId, itemId, ownerSubject, occurredAt: new Date().toISOString(), schemaVersion: 1 } } });
      return { deleted: true };
    });
  }

  private checkEventWindow(event: { startAt: Date | null; endAt: Date | null }, startAt: Date, endAt: Date | null) {
    if (event.startAt && startAt < event.startAt) throw new BadRequestException('Ceremony cannot start before the event startAt');
    if (event.endAt && (startAt > event.endAt || (endAt && endAt > event.endAt))) throw new BadRequestException('Ceremony must fit within the event date range');
  }

  private async lockEvent(tx: Prisma.TransactionClient, ownerSubject: string, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; status: EventStatus; start_at: Date | null; end_at: Date | null }>>`
      SELECT e."id", e."status", e."start_at", e."end_at"
      FROM "events" e
      WHERE e."id" = ${id}::uuid AND (
        (e."agency_workspace_id" IS NULL AND e."owner_subject" = ${ownerSubject}) OR EXISTS (
          SELECT 1 FROM "agency_memberships" m
          WHERE m."workspace_id" = e."agency_workspace_id" AND m."subject" = ${ownerSubject}
          AND m."status" = 'ACTIVE' AND EXISTS (
            SELECT 1 FROM "agency_workspaces" w WHERE w."id" = m."workspace_id" AND w."status" = 'ACTIVE'
          )
        )
      ) FOR UPDATE
    `;
    const event = rows[0];
    return event ? { id: event.id, status: event.status, startAt: event.start_at, endAt: event.end_at } : null;
  }

  private assertUuid(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundException('Resource not found');
  }
}
