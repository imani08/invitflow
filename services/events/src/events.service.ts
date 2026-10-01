import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CeremonyStatus, EventStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';
import type { CeremonyFields, CreateCeremonyFields, CreateEventFields, EventFields } from './events.types.js';

const eventSelect = {
  id: true, name: true, description: true, eventType: true, status: true, startAt: true, endAt: true, timezone: true,
  createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async list(ownerSubject: string, limit: number, cursor?: string) {
    if (cursor) {
      const ownedCursor = await this.prisma.event.findFirst({ where: { id: cursor, ownerSubject }, select: { id: true } });
      if (!ownedCursor) throw new NotFoundException('Event not found');
    }
    const rows = await this.prisma.event.findMany({
      where: { ownerSubject },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { ...eventSelect, ceremonies: { orderBy: { startAt: 'asc' } }, _count: { select: { ceremonies: true } } },
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return { items: page.map(({ _count, ...event }) => ({ ...event, ceremonyCount: _count.ceremonies })), nextCursor: hasMore ? page.at(-1)?.id ?? null : null };
  }

  async get(ownerSubject: string, id: string) {
    this.assertUuid(id);
    const event = await this.prisma.event.findFirst({ where: { id, ownerSubject }, select: { ...eventSelect, ceremonies: { orderBy: { startAt: 'asc' } } } });
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
      if (event.status === EventStatus.PUBLISHED) return tx.event.findFirst({ where: { id, ownerSubject }, select: { ...eventSelect, ceremonies: true } });
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
      return tx.event.findFirstOrThrow({ where: { id, ownerSubject }, select: { ...eventSelect, ceremonies: { orderBy: { startAt: 'asc' } } } });
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

  private checkEventWindow(event: { startAt: Date | null; endAt: Date | null }, startAt: Date, endAt: Date | null) {
    if (event.startAt && startAt < event.startAt) throw new BadRequestException('Ceremony cannot start before the event startAt');
    if (event.endAt && (startAt > event.endAt || (endAt && endAt > event.endAt))) throw new BadRequestException('Ceremony must fit within the event date range');
  }

  private async lockEvent(tx: Prisma.TransactionClient, ownerSubject: string, id: string) {
    const rows = await tx.$queryRaw<Array<{ id: string; status: EventStatus; start_at: Date | null; end_at: Date | null }>>`
      SELECT "id", "status", "start_at", "end_at"
      FROM "events"
      WHERE "id" = ${id}::uuid AND "owner_subject" = ${ownerSubject}
      FOR UPDATE
    `;
    const event = rows[0];
    return event ? { id: event.id, status: event.status, startAt: event.start_at, endAt: event.end_at } : null;
  }

  private assertUuid(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundException('Resource not found');
  }
}
