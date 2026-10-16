import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgencyMemberStatus, AgencyWorkspaceStatus, CeremonyStatus, EventStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';
import type { CeremonyFields, CreateCeremonyFields, CreateEventFields, EventFields } from './events.types.js';
import { createHash } from 'node:crypto';
import { eventLifecycleAction } from './event-lifecycle.js';
import { isEventDueForAutomaticCompletion } from './event-auto-completion.js';
import { dateReminderKey, dateReminderKind } from './event-date-reminders.js';

const eventSelect = {
  id: true, ownerSubject: true, name: true, description: true, coupleNames: true, invitationText: true, eventType: true, status: true, startAt: true, endAt: true, timezone: true, agencyWorkspaceId: true,
  createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async completeDueEvents(now = new Date()) {
    const candidates = await this.prisma.event.findMany({
      where: { status: EventStatus.PUBLISHED },
      orderBy: { updatedAt: 'asc' },
      take: 500,
      select: {
        id: true, ownerSubject: true, name: true, eventType: true, agencyWorkspaceId: true, status: true, timezone: true, startAt: true, endAt: true,
        ceremonies: { select: { id: true, name: true, ceremonyType: true, status: true, timezone: true, location: true, startAt: true, endAt: true } },
      },
    });
    let completed = 0;
    for (const event of candidates) {
      await this.publishDateReminders(event, now);
      if (!isEventDueForAutomaticCompletion(event, now)) continue;
      const changed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.event.updateMany({ where: { id: event.id, status: EventStatus.PUBLISHED }, data: { status: EventStatus.COMPLETED } });
        if (!result.count) return false;
      await tx.outboxMessage.create({ data: {
          eventType: 'events.completed.v1', aggregateId: event.id,
          payload: { id: event.id, eventId: event.id, ownerSubject: event.ownerSubject, name: event.name, eventType: event.eventType, agencyWorkspaceId: event.agencyWorkspaceId, timezone: event.timezone, startAt: event.startAt?.toISOString() ?? null, endAt: event.endAt?.toISOString() ?? null, from: EventStatus.PUBLISHED, to: EventStatus.COMPLETED, action: 'auto_complete', occurredAt: now.toISOString(), schemaVersion: 1 },
        } });
        return true;
      });
      if (changed) completed += 1;
    }
    return { completed };
  }

  private async publishDateReminders(event: {
    id: string; ownerSubject: string; name: string; eventType: string; agencyWorkspaceId: string | null; timezone: string; startAt: Date | null;
    ceremonies: Array<{ id: string; name: string; ceremonyType: string; status: CeremonyStatus; timezone: string; location: string | null; startAt: Date; endAt: Date | null }>;
  }, now: Date) {
    const targets: Array<{ targetType: 'EVENT' | 'CEREMONY'; targetId: string; targetAt: Date; payload: Record<string, string | number | null> }> = [];
    if (event.startAt) targets.push({ targetType: 'EVENT', targetId: event.id, targetAt: event.startAt, payload: { eventId: event.id, ownerSubject: event.ownerSubject, eventName: event.name, eventType: event.eventType, agencyWorkspaceId: event.agencyWorkspaceId, timezone: event.timezone, kind: 'EVENT', targetAt: event.startAt.toISOString() } });
    for (const ceremony of event.ceremonies) {
      if (ceremony.status === CeremonyStatus.CANCELLED) continue;
      targets.push({ targetType: 'CEREMONY', targetId: ceremony.id, targetAt: ceremony.startAt, payload: { eventId: event.id, ownerSubject: event.ownerSubject, eventName: event.name, eventType: event.eventType, agencyWorkspaceId: event.agencyWorkspaceId, timezone: event.timezone, kind: 'CEREMONY', ceremonyId: ceremony.id, ceremonyName: ceremony.name, ceremonyType: ceremony.ceremonyType, ceremonyTimezone: ceremony.timezone, ceremonyStartAt: ceremony.startAt.toISOString(), location: ceremony.location, targetAt: ceremony.startAt.toISOString() } });
    }
    const pending = targets.map((target) => ({ target, reminder: dateReminderKind(target.targetAt, target.payload['ceremonyTimezone'] as string || event.timezone, now) })).filter((item): item is { target: (typeof targets)[number]; reminder: NonNullable<ReturnType<typeof dateReminderKind>> } => item.reminder !== null);
    if (!pending.length) return;
    const existing = await this.prisma.outboxMessage.findMany({ where: { eventType: 'events.date.reminder.v1', aggregateId: event.id }, select: { payload: true } });
    const emitted = new Set(existing.map(({ payload }) => payload && typeof payload === 'object' && !Array.isArray(payload) && typeof (payload as { reminderKey?: unknown }).reminderKey === 'string' ? (payload as { reminderKey: string }).reminderKey : ''));
    const newReminders = pending.filter(({ target, reminder }) => !emitted.has(dateReminderKey(target.targetType, target.targetId, reminder)));
    if (!newReminders.length) return;
    await this.prisma.$transaction(async (tx) => {
      for (const { target, reminder } of newReminders) {
        const reminderKey = dateReminderKey(target.targetType, target.targetId, reminder);
        await tx.outboxMessage.create({ data: { eventType: 'events.date.reminder.v1', aggregateId: event.id, payload: { ...target.payload, reminder, reminderKey, occurredAt: now.toISOString(), schemaVersion: 1 } } });
      }
    });
  }

  async agencyDashboard(subject: string) {
    await this.prisma.agencySubscription.updateMany({ where: { status: 'ACTIVE', billingPeriodEnd: { lte: new Date() } }, data: { status: 'PAST_DUE' } });
    const memberships = await this.prisma.agencyMembership.findMany({
      where: { subject, status: 'ACTIVE', workspace: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'asc' },
      include: { workspace: { include: { subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    });
    return Promise.all(memberships.map(async ({ workspace, role }) => {
      const activeSubscription = await this.prisma.agencySubscription.findFirst({ where: { workspaceId: workspace.id, status: 'ACTIVE', startsAt: { lte: new Date() }, billingPeriodEnd: { gt: new Date() } }, orderBy: { billingPeriodEnd: 'desc' } });
      const displayedSubscription = activeSubscription ?? workspace.subscriptions[0] ?? null;
      const [clients, events, consumed, reserved] = await Promise.all([
        this.prisma.agencyClient.count({ where: { workspaceId: workspace.id } }),
        this.prisma.event.count({ where: { agencyWorkspaceId: workspace.id } }),
        this.prisma.agencyQuotaReservation.aggregate({ where: { subscriptionId: displayedSubscription?.id ?? '00000000-0000-4000-8000-000000000000', status: 'CONSUMED' }, _sum: { credits: true } }),
        this.prisma.agencyQuotaReservation.aggregate({ where: { subscriptionId: displayedSubscription?.id ?? '00000000-0000-4000-8000-000000000000', status: 'RESERVED' }, _sum: { credits: true } }),
      ]);
      return { id: workspace.id, name: workspace.name, status: workspace.status, role, plan: displayedSubscription,
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
    const actor = await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN']);
    if (actor.role === 'ADMIN' && role === 'ADMIN') throw new ForbiddenException('Admins may add members only');
    if (memberSubject === subject) throw new BadRequestException('An owner cannot invite themselves as a member');
    try {
      return await this.prisma.agencyMembership.create({ data: { workspaceId, subject: memberSubject, role, addedBy: subject }, select: { id: true, subject: true, role: true, status: true, createdAt: true } });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException('This person is already a member');
      throw error;
    }
  }

  async updateAgencyMember(actor: string, workspaceId: string, memberId: string, change: { role?: 'ADMIN' | 'MEMBER'; status?: 'ACTIVE' | 'SUSPENDED' | 'REMOVED' }) {
    const actorMembership = await this.requireAgencyRole(actor, workspaceId, ['OWNER', 'ADMIN']);
    if (!Object.keys(change).length || Object.keys(change).some((key) => !['role', 'status'].includes(key))) throw new BadRequestException('Member change is invalid');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "agency_workspaces" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`;
      const target = await tx.agencyMembership.findFirst({ where: { id: memberId, workspaceId }, select: { id: true, subject: true, role: true, status: true } });
      if (!target) throw new NotFoundException('Agency member not found');
      if (actorMembership.role === 'ADMIN' && target.role !== 'MEMBER') throw new ForbiddenException('Admins can manage members only');
      if (target.role === 'OWNER' && (change.role !== undefined || change.status === 'SUSPENDED' || change.status === 'REMOVED')) {
        const owners = await tx.agencyMembership.count({ where: { workspaceId, role: 'OWNER', status: 'ACTIVE' } });
        if (owners <= 1) throw new ConflictException('The last active agency owner cannot be changed, suspended or removed');
      }
      const updated = await tx.agencyMembership.update({ where: { id: target.id }, data: { ...change }, select: { id: true, subject: true, role: true, status: true, createdAt: true } });
      await tx.agencyAuditEntry.create({ data: { workspaceId, actorSubject: actor, targetSubject: target.subject, action: change.status === 'REMOVED' ? 'MEMBER_REMOVED' : change.status ? `MEMBER_${change.status}` : 'MEMBER_ROLE_CHANGED', before: target, after: { id: updated.id, subject: updated.subject, role: updated.role, status: updated.status } } });
      return updated;
    });
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

  async updateAgencyClient(subject: string, workspaceId: string, clientId: string, input: { name?: string; email?: string | null; phone?: string | null }) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN']);
    const data: { name?: string; email?: string | null; phone?: string | null } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (name.length < 2 || name.length > 120) throw new BadRequestException('Client details are invalid');
      data.name = name;
    }
    if (input.email !== undefined) {
      const email = input.email?.trim() || null;
      if (email !== null && (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new BadRequestException('Client details are invalid');
      data.email = email;
    }
    if (input.phone !== undefined) {
      const phone = input.phone?.trim() || null;
      if (phone !== null && phone.length > 40) throw new BadRequestException('Client details are invalid');
      data.phone = phone;
    }
    const updated = await this.prisma.agencyClient.updateMany({ where: { id: clientId, workspaceId }, data });
    if (!updated.count) throw new NotFoundException('Agency client not found');
    return this.prisma.agencyClient.findFirstOrThrow({ where: { id: clientId, workspaceId } });
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
    const value = catalog as { scheduleId: string; version: number; packs: Array<{ id: string; key: string; name: string; credits: number; periodDays: number | null; checkInEvents: number; checkInGuestCapacity: number; priceMinor: number; currency: string; segment: string }> };
    const pack = value.packs.find((candidate) => candidate.key === planKey && candidate.segment === 'AGENCY');
    if (!pack || pack.periodDays !== null && pack.periodDays !== 30 || !Number.isSafeInteger(value.version) || !/^[0-9a-f-]{36}$/i.test(value.scheduleId)) throw new BadRequestException('Select a valid agency plan');
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.agencySubscription.findFirst({ where: { workspaceId, status: { in: ['ACTIVE', 'PAST_DUE'] } }, orderBy: { billingPeriodEnd: 'desc' } });
      const existing = await tx.agencySubscription.findFirst({ where: { workspaceId, planPackId: pack.id, priceScheduleId: value.scheduleId, renewalOfId: previous?.id ?? null, status: 'PENDING', paymentId: null }, orderBy: { createdAt: 'desc' } });
      if (existing) return existing;
      await tx.agencySubscription.updateMany({ where: { workspaceId, status: 'PENDING' }, data: { status: 'CANCELLED', endsAt: new Date() } });
      if (!Number.isSafeInteger(pack.checkInEvents) || !Number.isSafeInteger(pack.checkInGuestCapacity) || pack.checkInEvents < 0 || pack.checkInGuestCapacity < 0 || (pack.checkInEvents === 0) !== (pack.checkInGuestCapacity === 0)) throw new BadRequestException('Agency plan check-in configuration is invalid');
      return tx.agencySubscription.create({ data: { workspaceId, planPackId: pack.id, planKey: pack.key, planName: pack.name, quotaCredits: pack.credits, checkInEventLimit: pack.checkInEvents, checkInGuestCapacity: pack.checkInGuestCapacity, priceMinor: pack.priceMinor, currency: pack.currency, priceScheduleId: value.scheduleId, priceScheduleVersion: value.version, currentPlanVersion: value.version, periodDays: 30, renewalOfId: previous?.id ?? null, status: 'PENDING' } });
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
    await this.prisma.agencySubscription.updateMany({ where: { workspaceId, status: 'ACTIVE', billingPeriodEnd: { lte: new Date() } }, data: { status: 'PAST_DUE' } });
    const prior = await this.prisma.agencyQuotaReservation.findUnique({ where: { referenceKey } });
      if (prior) {
        if (prior.workspaceId !== workspaceId || prior.eventId !== eventId || (allowPartial ? prior.credits > credits : prior.credits !== credits) || prior.status !== 'RESERVED') throw new ConflictException('Quota reservation reference was already used');
        return { ...prior, remaining: await this.agencyQuotaRemaining(workspaceId, prior.subscriptionId), reservedCredits: prior.credits };
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const event = await tx.event.findFirst({ where: { id: eventId, agencyWorkspaceId: workspaceId }, select: { id: true } });
        if (!event) throw new NotFoundException('Agency event not found');
        const subscription = await tx.agencySubscription.findFirst({ where: { workspaceId, status: 'ACTIVE', startsAt: { lte: new Date() }, billingPeriodEnd: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
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
          await tx.outboxMessage.create({ data: { eventType: 'agencies.quota.reserved.v1', aggregateId: subscription.id, payload: { workspaceId, eventId, reservationId: reservation.id, referenceKey, credits: reservedCredits, remaining: remaining - reservedCredits, subject, ownerSubject: subject, occurredAt: new Date().toISOString(), schemaVersion: 1 } } });
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
    await this.prisma.agencySubscription.updateMany({ where: { workspaceId, status: 'ACTIVE', billingPeriodEnd: { lte: new Date() } }, data: { status: 'PAST_DUE' } });
    const subscription = await this.prisma.agencySubscription.findFirst({ where: { workspaceId, status: 'ACTIVE', startsAt: { lte: new Date() }, billingPeriodEnd: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
    if (!subscription) return { subscriptionId: null, includedQuota: 0, consumed: 0, reserved: 0, remaining: 0, checkInEventLimit: 0, checkInActivationsRemaining: 0, checkInGuestCapacity: 0 };
    const [consumed, reserved] = await Promise.all([
      this.prisma.agencyQuotaReservation.aggregate({ where: { subscriptionId: subscription.id, status: 'CONSUMED' }, _sum: { credits: true } }),
      this.prisma.agencyQuotaReservation.aggregate({ where: { subscriptionId: subscription.id, status: 'RESERVED' }, _sum: { credits: true } }),
    ]);
    const consumedCredits = consumed._sum.credits ?? 0;
    const reservedCredits = reserved._sum.credits ?? 0;
    // The optional branch keeps historical unit-test adapters (which predate
    // V4 activations) read-compatible; production Prisma always provides it.
    const activationRepository = (this.prisma as unknown as { agencyCheckInActivation?: { count(args: unknown): Promise<number> } }).agencyCheckInActivation;
    const activations = activationRepository ? await activationRepository.count({ where: { subscriptionId: subscription.id } }) : 0;
    return { subscriptionId: subscription.id, includedQuota: subscription.quotaCredits, consumed: consumedCredits, reserved: reservedCredits, remaining: Math.max(0, subscription.quotaCredits - consumedCredits - reservedCredits), checkInEventLimit: subscription.checkInEventLimit, checkInActivationsRemaining: Math.max(0, subscription.checkInEventLimit - activations), checkInGuestCapacity: subscription.checkInGuestCapacity };
  }

  async activateAgencyCheckIn(subject: string, workspaceId: string, eventId: string) {
    await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN']); this.assertUuid(eventId);
    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.findFirst({ where: { id: eventId, agencyWorkspaceId: workspaceId }, select: { id: true } });
      if (!event) throw new NotFoundException('Agency event not found');
      const existing = await tx.agencyCheckInActivation.findUnique({ where: { eventId } });
      if (existing) return existing;
      const subscription = await tx.agencySubscription.findFirst({ where: { workspaceId, status: 'ACTIVE', billingPeriodEnd: { gt: new Date() }, checkInEventLimit: { gt: 0 } }, orderBy: { createdAt: 'desc' } });
      if (!subscription || subscription.checkInGuestCapacity < 1) throw new BadRequestException('Aucune activation de pointage agence disponible pour cette période.');
      const used = await tx.agencyCheckInActivation.count({ where: { subscriptionId: subscription.id } });
      if (used >= subscription.checkInEventLimit) throw new BadRequestException('La limite d’événements avec pointage de ce plan est atteinte.');
      return tx.agencyCheckInActivation.create({ data: { workspaceId, eventId, subscriptionId: subscription.id, guestCapacity: subscription.checkInGuestCapacity, activatedBy: subject } });
    });
  }

  async agencyCheckInEntitlement(eventId: string) {
    this.assertUuid(eventId);
    const activation = await this.prisma.agencyCheckInActivation.findUnique({ where: { eventId }, include: { event: { select: { agencyWorkspaceId: true, ownerSubject: true } } } });
    if (!activation) return null;
    return { id: activation.id, source: 'AGENCY', eventId: activation.eventId, workspaceId: activation.workspaceId, ownerSubject: activation.event.ownerSubject, guestCapacity: activation.guestCapacity };
  }

  async finalizeAgencyQuotaReservation(subject: string, workspaceId: string, referenceKey: string, finalStatus: 'CONSUMED' | 'RELEASED', consumedCredits?: number, internal = false, releaseEventId?: string) {
    if (!internal) await this.requireAgencyRole(subject, workspaceId, ['OWNER', 'ADMIN', 'MEMBER']);
    let current = await this.prisma.agencyQuotaReservation.findUnique({ where: { referenceKey } });
    if (!current && internal && finalStatus === 'RELEASED' && releaseEventId) {
      this.assertUuid(releaseEventId);
      if (!/^[A-Za-z0-9._:@/-]{1,200}$/.test(referenceKey)) throw new BadRequestException('Invalid quota reference');
      const event = await this.prisma.event.findFirst({ where: { id: releaseEventId, agencyWorkspaceId: workspaceId }, select: { id: true } });
      if (!event) throw new NotFoundException('Agency event not found');
      // A release received before an ambiguous reserve closes the reference.
      // Unique upsert also handles a reservation committing concurrently.
      current = await this.prisma.agencyQuotaReservation.upsert({ where: { referenceKey }, create: { workspaceId, eventId: releaseEventId, referenceKey, credits: 0, status: 'RELEASED' }, update: {} });
    }
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
      await tx.outboxMessage.create({ data: { eventType: actualStatus === 'CONSUMED' ? 'agencies.quota.consumed.v1' : 'agencies.quota.released.v1', aggregateId: current.subscriptionId ?? workspaceId, payload: { workspaceId, eventId: current.eventId, reservationId: current.id, referenceKey, credits: actualStatus === 'CONSUMED' ? finalCredits : current.credits, subject, ownerSubject: subject, occurredAt: new Date().toISOString(), schemaVersion: 1 } } });
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
    if (!subscription || subscription.planPackId !== snapshot['packId'] || subscription.periodDays !== snapshot['periodDays'] || subscription.priceScheduleId !== snapshot['priceScheduleId'] || subscription.priceScheduleVersion !== snapshot['priceScheduleVersion'] || subscription.priceMinor !== event['amountMinor'] || subscription.currency.trim() !== event['currency']) throw new ConflictException('Confirmed payment does not match the agency subscription snapshot');
    if (subscription.status === 'ACTIVE' && subscription.paymentId === event['paymentId'] && subscription.paymentOrderId === event['orderId']) return { activated: false, subscription };
    if (subscription.status !== 'PENDING' || subscription.paymentId !== event['paymentId'] || subscription.paymentOrderId !== event['orderId']) throw new ConflictException('Payment does not match the pending agency checkout');
    if (subscription.periodDays !== 30 || snapshot['periodDays'] !== 30) throw new ConflictException('Agency subscriptions must have an exact 30-day billing period');
    const startedAt = new Date();
    const periodEnd = new Date(startedAt.getTime() + 30 * 86_400_000);
    const changed = await this.prisma.agencySubscription.updateMany({ where: { id: subscription.id, status: 'PENDING', paymentId: event['paymentId'], paymentOrderId: event['orderId'] }, data: { status: 'ACTIVE', startsAt: startedAt, endsAt: periodEnd, billingPeriodStart: startedAt, billingPeriodEnd: periodEnd, currentPlanVersion: subscription.priceScheduleVersion } });
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

  async list(ownerSubject: string, limit: number, cursor?: string, listScope: 'agency' | 'personal' = 'personal') {
    const scope: Prisma.EventWhereInput = listScope === 'agency'
      ? { agencyWorkspace: { is: { status: AgencyWorkspaceStatus.ACTIVE, memberships: { some: { subject: ownerSubject, status: AgencyMemberStatus.ACTIVE } } } } }
      : { ownerSubject, agencyWorkspaceId: null };
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
        payload: { id, eventId: id, ownerSubject, name: event.name, eventType: event.eventType, agencyWorkspaceId: event.agencyWorkspaceId, timezone: event.timezone, changedFields: Object.keys(data), occurredAt: new Date().toISOString(), schemaVersion: 1 },
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
      if (event.eventType === 'WEDDING' && scheduled === 0) throw new BadRequestException('Ajoutez au moins une cérémonie planifiée avant de publier un mariage.');
      const transition = await tx.event.updateMany({ where: { id, ownerSubject, status: EventStatus.DRAFT }, data: { status: EventStatus.PUBLISHED } });
      if (transition.count !== 1) throw new ConflictException('Event status changed; reload before publishing');
      const updated = await tx.event.findFirstOrThrow({ where: { id, ownerSubject }, select: eventSelect });
      await tx.outboxMessage.create({ data: {
        eventType: 'events.published.v1', aggregateId: id,
        payload: { id, eventId: id, ownerSubject, name: updated.name, eventType: updated.eventType, agencyWorkspaceId: updated.agencyWorkspaceId, timezone: updated.timezone, startAt: updated.startAt?.toISOString() ?? null, endAt: updated.endAt?.toISOString() ?? null, occurredAt: new Date().toISOString(), schemaVersion: 1 },
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
          payload: { id, eventId: id, ownerSubject, name: event.name, eventType: event.eventType, agencyWorkspaceId: event.agencyWorkspaceId, timezone: event.timezone, startAt: event.startAt?.toISOString() ?? null, endAt: event.endAt?.toISOString() ?? null, occurredAt: new Date().toISOString(), schemaVersion: 1 },
        } });
      }
    });
    return this.get(ownerSubject, id);
  }

  async lifecycle(ownerSubject: string, id: string, action: 'complete' | 'archive' | 'restore') {
    this.assertUuid(id);
    return this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, id);
      if (!event) throw new NotFoundException('Event not found');
      const target = eventLifecycleAction(event.status, action);
      if (!target) throw new BadRequestException('This event lifecycle transition is not allowed');
      const changed = await tx.event.updateMany({ where: { id, ownerSubject, status: event.status }, data: { status: target as EventStatus } });
      if (!changed.count) throw new ConflictException('Event status changed; reload before continuing');
      await tx.outboxMessage.create({ data: {
        eventType: `events.${action}d.v1`, aggregateId: id,
        payload: { id, eventId: id, ownerSubject, name: event.name, eventType: event.eventType, agencyWorkspaceId: event.agencyWorkspaceId, timezone: event.timezone, from: event.status, to: target, action, occurredAt: new Date().toISOString(), schemaVersion: 1 },
      } });
      return tx.event.findFirstOrThrow({ where: { id, ownerSubject }, select: { ...eventSelect, ceremonies: { orderBy: { startAt: 'asc' }, include: { programItems: { orderBy: { position: 'asc' } } } } } });
    });
  }

  async addCeremony(ownerSubject: string, eventId: string, data: CreateCeremonyFields, requestKey?: string) {
    this.assertUuid(eventId);
    if (requestKey !== undefined && !/^[a-zA-Z0-9_-]{8,128}$/.test(requestKey)) throw new BadRequestException('Clé de reprise du moment invalide.');
    let id: string | undefined;
    if (requestKey) {
      const digest = createHash('sha256').update(JSON.stringify([ownerSubject, eventId, requestKey])).digest();
      digest[6] = (digest[6]! & 15) | 80; digest[8] = (digest[8]! & 63) | 128;
      const hex = digest.subarray(0, 16).toString('hex');
      id = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    }
    return this.prisma.$transaction(async (tx) => {
      const event = await this.lockEvent(tx, ownerSubject, eventId);
      if (!event) throw new NotFoundException('Event not found');
      if (id) {
        const prior = await tx.ceremony.findUnique({ where: { id } });
        if (prior) {
          const same = Object.entries(data).every(([key, value]) => { const saved = prior[key as keyof typeof prior]; return value instanceof Date ? saved instanceof Date && saved.getTime() === value.getTime() : saved === value || (value === undefined && saved === null); });
          if (!same) throw new ConflictException('Cette demande a déjà enregistré un moment différent. Actualisez le programme avant de continuer.');
          return prior;
        }
      }
      if (event.status !== EventStatus.DRAFT) throw new BadRequestException('Ceremonies can only be added to draft events');
      this.checkEventWindow(event, data.startAt as Date, data.endAt instanceof Date ? data.endAt : null);
      const ceremony = await tx.ceremony.create({ data: { ...data, eventId, ...(id ? { id } : {}) } });
      await tx.outboxMessage.create({ data: {
        eventType: 'events.ceremony.created.v1', aggregateId: eventId,
        payload: { eventId, ceremonyId: ceremony.id, ownerSubject, eventName: event.name, agencyWorkspaceId: event.agencyWorkspaceId, ceremonyName: ceremony.name, ceremonyType: ceremony.ceremonyType, ceremonyTimezone: ceremony.timezone, ceremonyStartAt: ceremony.startAt.toISOString(), ceremonyEndAt: ceremony.endAt?.toISOString() ?? null, location: ceremony.location, occurredAt: ceremony.createdAt.toISOString(), schemaVersion: 1 },
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
      const current = await tx.ceremony.findFirst({ where: { id: ceremonyId, eventId }, select: { id: true, name: true, ceremonyType: true, timezone: true, location: true, startAt: true, endAt: true, status: true } });
      if (!current) throw new NotFoundException('Ceremony not found');
      const startAt = data.startAt instanceof Date ? data.startAt : current.startAt;
      const endAt = data.endAt === null ? null : data.endAt instanceof Date ? data.endAt : current.endAt;
      if (endAt && endAt <= startAt) throw new BadRequestException('endAt must be after startAt');
      this.checkEventWindow(event, startAt, endAt);
      const result = await tx.ceremony.updateMany({ where: { id: ceremonyId, eventId }, data });
      if (!result.count) throw new NotFoundException('Ceremony not found');
      const updated = await tx.ceremony.findFirstOrThrow({ where: { id: ceremonyId, eventId } });
      await tx.outboxMessage.create({ data: {
        eventType: 'events.ceremony.updated.v1', aggregateId: eventId,
        payload: { eventId, ceremonyId, ownerSubject, eventName: event.name, agencyWorkspaceId: event.agencyWorkspaceId, ceremonyName: updated.name, ceremonyType: updated.ceremonyType, ceremonyTimezone: updated.timezone, ceremonyStartAt: updated.startAt.toISOString(), ceremonyEndAt: updated.endAt?.toISOString() ?? null, location: updated.location, changedFields: Object.keys(data), occurredAt: new Date().toISOString(), schemaVersion: 1 },
      } });
      return updated;
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
        payload: { eventId, ceremonyId, ownerSubject, eventName: event.name, agencyWorkspaceId: event.agencyWorkspaceId, occurredAt: new Date().toISOString(), schemaVersion: 1 },
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
      await tx.outboxMessage.create({ data: { eventType: 'events.ceremony.program-item.created.v1', aggregateId: eventId, payload: { eventId, ceremonyId, itemId: item.id, position, ownerSubject, eventName: event.name, agencyWorkspaceId: event.agencyWorkspaceId, title: item.title, startsAt: item.startsAt?.toISOString() ?? null, durationMinutes: item.durationMinutes, location: item.location, occurredAt: item.createdAt.toISOString(), schemaVersion: 1 } } });
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
      await tx.outboxMessage.create({ data: { eventType: 'events.ceremony.program-item.updated.v1', aggregateId: eventId, payload: { eventId, ceremonyId, itemId, ownerSubject, eventName: event.name, agencyWorkspaceId: event.agencyWorkspaceId, changedFields: Object.keys(data), occurredAt: new Date().toISOString(), schemaVersion: 1 } } });
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
      await tx.outboxMessage.create({ data: { eventType: 'events.ceremony.program-reordered.v1', aggregateId: eventId, payload: { eventId, ceremonyId, itemIds, ownerSubject, eventName: event.name, agencyWorkspaceId: event.agencyWorkspaceId, occurredAt: new Date().toISOString(), schemaVersion: 1 } } });
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
      await tx.outboxMessage.create({ data: { eventType: 'events.ceremony.program-item.deleted.v1', aggregateId: eventId, payload: { eventId, ceremonyId, itemId, ownerSubject, eventName: event.name, agencyWorkspaceId: event.agencyWorkspaceId, occurredAt: new Date().toISOString(), schemaVersion: 1 } } });
      return { deleted: true };
    });
  }

  private checkEventWindow(event: { startAt: Date | null; endAt: Date | null }, startAt: Date, endAt: Date | null) {
    if (event.startAt && startAt < event.startAt) throw new BadRequestException('Ceremony cannot start before the event startAt');
    if (event.endAt && (startAt > event.endAt || (endAt && endAt > event.endAt))) throw new BadRequestException('Ceremony must fit within the event date range');
  }

  private async lockEvent(tx: Prisma.TransactionClient, ownerSubject: string, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; status: EventStatus; event_type: string; name: string; agency_workspace_id: string | null; timezone: string; start_at: Date | null; end_at: Date | null }>>`
      SELECT e."id", e."status", e."event_type", e."name", e."agency_workspace_id", e."timezone", e."start_at", e."end_at"
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
    return event ? { id: event.id, status: event.status, eventType: event.event_type, name: event.name, agencyWorkspaceId: event.agency_workspace_id, timezone: event.timezone, startAt: event.start_at, endAt: event.end_at } : null;
  }

  private assertUuid(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundException('Resource not found');
  }
}
