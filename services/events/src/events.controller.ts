import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { IdentityGuard, type VerifiedIdentity } from './identity.guard.js';
import { EventsService } from './events.service.js';
import { parseIsoTimestamp, timestampMatchesTimeZone } from './events-date.js';
import type { CeremonyFields, CreateCeremonyFields, CreateEventFields, EventFields } from './events.types.js';

type AuthRequest = FastifyRequest & { identity: VerifiedIdentity };
type EventInput = { name?: unknown; description?: unknown; eventType?: unknown; startAt?: unknown; endAt?: unknown; timezone?: unknown };
type CeremonyInput = { name?: unknown; ceremonyType?: unknown; description?: unknown; location?: unknown; address?: unknown; latitude?: unknown; longitude?: unknown; instructions?: unknown; dressCode?: unknown; notes?: unknown; capacity?: unknown; startAt?: unknown; endAt?: unknown; timezone?: unknown };

function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null && field !== 'name' && field !== 'eventType') return null;
  if (typeof value !== 'string') throw new BadRequestException(`${field} must be a string`);
  const trimmed = value.trim();
  if (field === 'name' && (trimmed.length < 2 || trimmed.length > max)) throw new BadRequestException(`${field} must contain 2 to ${max} characters`);
  if (trimmed.length > max) throw new BadRequestException(`${field} cannot exceed ${max} characters`);
  return trimmed;
}

function timestamp(value: unknown, field: string, required: boolean, timezone?: string): Date | null | undefined {
  if (value === undefined) {
    if (required) throw new BadRequestException(`${field} is required`);
    return undefined;
  }
  if (value === null && !required) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${field} must be an ISO-8601 timestamp with an explicit UTC offset`);
  }
  const date = parseIsoTimestamp(value);
  if (!date) throw new BadRequestException(`${field} must be a valid ISO-8601 timestamp with an explicit UTC offset`);
  if (timezone && !timestampMatchesTimeZone(value, timezone)) throw new BadRequestException(`${field} local time and UTC offset must match timezone`);
  return date;
}

function timeZone(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 100) throw new BadRequestException('timezone must be an IANA timezone');
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { throw new BadRequestException('timezone must be a valid IANA timezone'); }
  return value;
}

function coordinate(value: unknown, field: 'latitude' | 'longitude'): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const min = field === 'latitude' ? -90 : -180;
  const max = field === 'latitude' ? 90 : 180;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new BadRequestException(`${field} is outside its valid range`);
  return value;
}

function ceremonyCapacity(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100_000) throw new BadRequestException('capacity must be an integer from 1 to 100000');
  return value;
}

function mapEvent(input: EventInput, creating: boolean): EventFields | CreateEventFields {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['name', 'description', 'eventType', 'startAt', 'endAt', 'timezone'].includes(key))) {
    throw new BadRequestException('Unsupported event fields');
  }
  const data: Record<string, unknown> = {};
  const name = optionalText(input.name, 'name', 120);
  const description = optionalText(input.description, 'description', 4000);
  const eventType = optionalText(input.eventType, 'eventType', 40);
  const timezone = timeZone(input.timezone);
  if (!creating && timezone === undefined && [input.startAt, input.endAt].some((value) => typeof value === 'string')) {
    throw new BadRequestException('timezone is required when updating event times');
  }
  const effectiveTimezone = timezone ?? 'Africa/Kinshasa';
  const startAt = timestamp(input.startAt, 'startAt', false, input.startAt === undefined || input.startAt === null ? undefined : effectiveTimezone);
  const endAt = timestamp(input.endAt, 'endAt', false, input.endAt === undefined || input.endAt === null ? undefined : effectiveTimezone);
  if (creating && (typeof name !== 'string' || typeof eventType !== 'string')) throw new BadRequestException('name and eventType are required');
  if (eventType !== undefined && (typeof eventType !== 'string' || !['WEDDING', 'BIRTHDAY', 'GRADUATION', 'BAPTISM', 'BABY_SHOWER', 'CONFERENCE', 'GALA', 'DINNER', 'CORPORATE', 'CEREMONY', 'RELIGIOUS', 'ANNIVERSARY', 'OTHER'].includes(eventType))) {
    throw new BadRequestException('eventType is not supported');
  }
  for (const [key, value] of Object.entries({ name, description, eventType, startAt, endAt, timezone })) if (value !== undefined) data[key] = value;
  if (startAt instanceof Date && endAt instanceof Date && endAt <= startAt) throw new BadRequestException('endAt must be after startAt');
  return data as EventFields | CreateEventFields;
}

function mapCeremony(input: CeremonyInput): CreateCeremonyFields {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['name', 'ceremonyType', 'description', 'location', 'address', 'latitude', 'longitude', 'instructions', 'dressCode', 'notes', 'capacity', 'startAt', 'endAt', 'timezone'].includes(key))) {
    throw new BadRequestException('Unsupported ceremony fields');
  }
  const name = optionalText(input.name, 'name', 120);
  const ceremonyType = optionalText(input.ceremonyType, 'ceremonyType', 40);
  const description = optionalText(input.description, 'description', 2000);
  const location = optionalText(input.location, 'location', 300);
  const address = optionalText(input.address, 'address', 500);
  const instructions = optionalText(input.instructions, 'instructions', 4000);
  const dressCode = optionalText(input.dressCode, 'dressCode', 200);
  const notes = optionalText(input.notes, 'notes', 2000);
  const latitude = coordinate(input.latitude, 'latitude');
  const longitude = coordinate(input.longitude, 'longitude');
  const capacity = ceremonyCapacity(input.capacity);
  const timezone = timeZone(input.timezone);
  const effectiveTimezone = timezone ?? 'Africa/Kinshasa';
  const startAt = timestamp(input.startAt, 'startAt', true, effectiveTimezone) as Date;
  const endAt = timestamp(input.endAt, 'endAt', false, input.endAt === undefined || input.endAt === null ? undefined : effectiveTimezone);
  if (!name || !ceremonyType) throw new BadRequestException('name and ceremonyType are required');
  if (ceremonyType.length < 2) throw new BadRequestException('ceremonyType must contain at least 2 characters');
  if ((latitude === undefined) !== (longitude === undefined) || (latitude === null) !== (longitude === null)) throw new BadRequestException('latitude and longitude must be provided together');
  if (endAt instanceof Date && endAt <= startAt) throw new BadRequestException('endAt must be after startAt');
  return {
    name,
    ceremonyType,
    startAt,
    ...(description !== undefined ? { description } : {}),
    ...(location !== undefined ? { location } : {}),
    ...(address !== undefined ? { address } : {}),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
    ...(instructions !== undefined ? { instructions } : {}),
    ...(dressCode !== undefined ? { dressCode } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...(capacity !== undefined ? { capacity } : {}),
    ...(endAt !== undefined ? { endAt } : {}),
    ...(timezone ? { timezone } : {}),
  } as CreateCeremonyFields;
}

@Controller('/v1/events')
@UseGuards(IdentityGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post() create(@Req() request: AuthRequest, @Body() body: EventInput) { return this.events.create(request.identity.subject, mapEvent(body ?? {}, true) as CreateEventFields); }

  @Get() list(@Req() request: AuthRequest, @Query('cursor') cursor?: string, @Query('limit') rawLimit?: string) {
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('limit must be from 1 to 100');
    if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) throw new BadRequestException('cursor must be an event UUID');
    return this.events.list(request.identity.subject, limit, cursor);
  }

  @Get('/:eventId') get(@Req() request: AuthRequest, @Param('eventId') eventId: string) { return this.events.get(request.identity.subject, eventId); }

  @Patch('/:eventId') update(@Req() request: AuthRequest, @Param('eventId') eventId: string, @Body() body: EventInput) {
    if (!body || Object.keys(body).length === 0) throw new BadRequestException('Provide at least one event field');
    return this.events.update(request.identity.subject, eventId, mapEvent(body, false));
  }

  @Post('/:eventId/publish') publish(@Req() request: AuthRequest, @Param('eventId') eventId: string) { return this.events.publish(request.identity.subject, eventId); }
  @Post('/:eventId/cancel') cancel(@Req() request: AuthRequest, @Param('eventId') eventId: string) { return this.events.cancel(request.identity.subject, eventId); }

  @Post('/:eventId/ceremonies') addCeremony(@Req() request: AuthRequest, @Param('eventId') eventId: string, @Body() body: CeremonyInput) {
    return this.events.addCeremony(request.identity.subject, eventId, mapCeremony(body ?? {}));
  }

  @Patch('/:eventId/ceremonies/:ceremonyId') updateCeremony(@Req() request: AuthRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string, @Body() body: CeremonyInput) {
    if (!body || Object.keys(body).length === 0) throw new BadRequestException('Provide at least one ceremony field');
    if (Object.keys(body).some((key) => !['name', 'ceremonyType', 'description', 'location', 'address', 'latitude', 'longitude', 'instructions', 'dressCode', 'notes', 'capacity', 'startAt', 'endAt', 'timezone'].includes(key))) throw new BadRequestException('Unsupported ceremony fields');
    const timezone = timeZone(body.timezone);
    if (timezone === undefined && [body.startAt, body.endAt].some((value) => typeof value === 'string')) {
      throw new BadRequestException('timezone is required when updating ceremony times');
    }
    const data: CeremonyFields = {};
    if (body.name !== undefined) {
      const name = optionalText(body.name, 'name', 120);
      if (typeof name !== 'string') throw new BadRequestException('name is required');
      data.name = name;
    }
    if (body.ceremonyType !== undefined) {
      const ceremonyType = optionalText(body.ceremonyType, 'ceremonyType', 40);
      if (typeof ceremonyType !== 'string') throw new BadRequestException('ceremonyType is required');
      data.ceremonyType = ceremonyType;
      if (ceremonyType.length < 2) throw new BadRequestException('ceremonyType must contain at least 2 characters');
    }
    if (body.description !== undefined) data.description = optionalText(body.description, 'description', 2000)!;
    if (body.location !== undefined) data.location = optionalText(body.location, 'location', 300)!;
    if (body.address !== undefined) data.address = optionalText(body.address, 'address', 500)!;
    if (body.latitude !== undefined) data.latitude = coordinate(body.latitude, 'latitude')!;
    if (body.longitude !== undefined) data.longitude = coordinate(body.longitude, 'longitude')!;
    if (body.instructions !== undefined) data.instructions = optionalText(body.instructions, 'instructions', 4000)!;
    if (body.dressCode !== undefined) data.dressCode = optionalText(body.dressCode, 'dressCode', 200)!;
    if (body.notes !== undefined) data.notes = optionalText(body.notes, 'notes', 2000)!;
    if (body.capacity !== undefined) data.capacity = ceremonyCapacity(body.capacity)!;
    if (body.startAt !== undefined) data.startAt = timestamp(body.startAt, 'startAt', true, timezone) as Date;
    if (body.endAt !== undefined) data.endAt = timestamp(body.endAt, 'endAt', false, typeof body.endAt === 'string' ? timezone : undefined) as Date | null;
    if (body.timezone !== undefined) data.timezone = timezone!;
    if ((data.latitude === undefined) !== (data.longitude === undefined)) throw new BadRequestException('latitude and longitude must be updated together');
    return this.events.updateCeremony(request.identity.subject, eventId, ceremonyId, data);
  }

  @Delete('/:eventId/ceremonies/:ceremonyId') removeCeremony(@Req() request: AuthRequest, @Param('eventId') eventId: string, @Param('ceremonyId') ceremonyId: string) {
    return this.events.removeCeremony(request.identity.subject, eventId, ceremonyId);
  }
}
