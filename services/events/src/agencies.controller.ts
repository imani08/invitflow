import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Req, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { IdentityGuard, type VerifiedIdentity } from './identity.guard.js';
import { EventsService } from './events.service.js';
import type { CreateEventFields } from './events.types.js';
import { parseIsoTimestamp, timestampMatchesTimeZone } from './events-date.js';

function agencyEventInput(input: unknown): CreateEventFields & { clientId: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Event details are invalid');
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['clientId', 'name', 'description', 'eventType', 'startAt', 'endAt', 'timezone'].includes(key))) throw new BadRequestException('Unsupported event fields');
  if (typeof body['clientId'] !== 'string' || !/^[0-9a-f-]{36}$/i.test(body['clientId']) || typeof body['name'] !== 'string' || body['name'].trim().length < 2 || body['name'].length > 120 || typeof body['eventType'] !== 'string') throw new BadRequestException('clientId, name and eventType are required');
  const timezone = typeof body['timezone'] === 'string' ? body['timezone'] : 'Africa/Kinshasa';
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { throw new BadRequestException('timezone must be valid'); }
  const timestamp = (field: string): Date | null | undefined => {
    const value = body[field]; if (value === undefined) return undefined; if (value === null) return null;
    if (typeof value !== 'string' || !parseIsoTimestamp(value) || !timestampMatchesTimeZone(value, timezone)) throw new BadRequestException(`${field} must match the event timezone`);
    return parseIsoTimestamp(value)!;
  };
  const startAt = timestamp('startAt'); const endAt = timestamp('endAt');
  if (startAt instanceof Date && endAt instanceof Date && endAt <= startAt) throw new BadRequestException('endAt must be after startAt');
  return { clientId: body['clientId'], name: body['name'].trim(), eventType: body['eventType'], timezone, ...(typeof body['description'] === 'string' ? { description: body['description'] } : {}), ...(startAt !== undefined ? { startAt } : {}), ...(endAt !== undefined ? { endAt } : {}) };
}

type AuthRequest = FastifyRequest & { identity: VerifiedIdentity };

@Controller('/v1/agencies')
@UseGuards(IdentityGuard)
export class AgenciesController {
  constructor(private readonly events: EventsService) {}

  @Get()
  dashboard(@Req() request: AuthRequest) { return this.events.agencyDashboard(request.identity.subject); }

  @Post()
  create(@Req() request: AuthRequest, @Body() body: { name?: unknown }) {
    if (!body || typeof body.name !== 'string') throw new BadRequestException('name is required');
    return this.events.createAgency(request.identity.subject, body.name);
  }

  @Get('/:workspaceId/members')
  members(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string) { return this.events.agencyMembers(request.identity.subject, workspaceId); }

  @Post('/:workspaceId/members')
  addMember(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string, @Body() body: { subject?: unknown; role?: unknown }) {
    if (typeof body?.subject !== 'string' || !body.subject.trim() || body.subject.length > 255 || (body.role !== 'ADMIN' && body.role !== 'MEMBER')) throw new BadRequestException('subject and role (ADMIN or MEMBER) are required');
    return this.events.addAgencyMember(request.identity.subject, workspaceId, body.subject.trim(), body.role);
  }

  @Get('/:workspaceId/clients')
  clients(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string) { return this.events.agencyClients(request.identity.subject, workspaceId); }

  @Post('/:workspaceId/clients')
  createClient(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string, @Body() body: { name?: unknown; email?: unknown; phone?: unknown }) {
    if (typeof body?.name !== 'string' || (body.email !== undefined && body.email !== null && typeof body.email !== 'string') || (body.phone !== undefined && body.phone !== null && typeof body.phone !== 'string')) throw new BadRequestException('Client details are invalid');
    return this.events.createAgencyClient(request.identity.subject, workspaceId, { name: body.name, ...(body.email !== undefined ? { email: body.email } : {}), ...(body.phone !== undefined ? { phone: body.phone } : {}) });
  }

  @Delete('/:workspaceId/clients/:clientId')
  removeClient(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string, @Param('clientId') clientId: string) { return this.events.removeAgencyClient(request.identity.subject, workspaceId, clientId); }

  @Get('/:workspaceId/events')
  async agencyEvents(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string) {
    const rows = await this.events.agencyEvents(request.identity.subject, workspaceId);
    return Promise.all(rows.map((row) => this.events.agencyEventDetail(request.identity.subject, workspaceId, row.id)));
  }

  @Post('/:workspaceId/events')
  createEvent(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string, @Body() body: unknown) {
    const input = agencyEventInput(body);
    const { clientId, ...event } = input;
    return this.events.createAgencyEvent(request.identity.subject, workspaceId, clientId, event);
  }

  @Post('/:workspaceId/subscriptions')
  async subscribe(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string, @Body() body: { planKey?: unknown }) {
    if (typeof body?.planKey !== 'string' || !/^[a-z][a-z0-9-]{1,59}$/.test(body.planKey)) throw new BadRequestException('planKey is invalid');
    const billingUrl = process.env['BILLING_SERVICE_URL'] ?? 'http://billing:3010';
    const authorization = request.headers.authorization ?? '';
    const catalogResponse = await fetch(`${billingUrl.replace(/\/$/, '')}/v1/pricing?segment=AGENCY`, { headers: { authorization }, cache: 'no-store', signal: AbortSignal.timeout(5_000) }).catch(() => null);
    if (!catalogResponse?.ok) throw new ServiceUnavailableException('Agency plans are temporarily unavailable');
    const catalog: unknown = await catalogResponse.json().catch(() => null);
    const subscription = await this.events.createAgencySubscription(request.identity.subject, workspaceId, catalog, body.planKey);
    const paymentsUrl = process.env['PAYMENTS_SERVICE_URL'] ?? 'http://payments:3011';
    const paymentResponse = await fetch(`${paymentsUrl.replace(/\/$/, '')}/v1/payments`, { method: 'POST', headers: { authorization, 'content-type': 'application/json', 'idempotency-key': `agency-subscription:${subscription.id}` }, body: JSON.stringify({ packId: subscription.planPackId, orderType: 'AGENCY_SUBSCRIPTION', businessReference: subscription.id, expectedPriceScheduleId: subscription.priceScheduleId, expectedPriceScheduleVersion: subscription.priceScheduleVersion }), cache: 'no-store', signal: AbortSignal.timeout(12_000) }).catch(() => null);
    const payment: unknown = await paymentResponse?.json().catch(() => null);
    if (!paymentResponse?.ok || !payment || typeof payment !== 'object' || !('id' in payment) || typeof payment['id'] !== 'string' || !('order' in payment) || !payment['order'] || typeof payment['order'] !== 'object' || !('id' in payment['order']) || typeof payment['order']['id'] !== 'string') throw new ServiceUnavailableException('Agency checkout could not be created; the pending subscription can be retried');
    const attached = await this.events.attachAgencyCheckout(request.identity.subject, workspaceId, subscription.id, payment['order']['id'], payment['id']);
    return { subscription: attached, payment };
  }

  @Post('/:workspaceId/quota/reservations')
  reserveQuota(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string, @Body() body: { eventId?: unknown; referenceKey?: unknown; credits?: unknown; allowPartial?: unknown }) {
    if (typeof body?.eventId !== 'string' || typeof body.referenceKey !== 'string' || typeof body.credits !== 'number') throw new BadRequestException('eventId, referenceKey and credits are required');
    if (body.allowPartial !== undefined && typeof body.allowPartial !== 'boolean') throw new BadRequestException('allowPartial must be boolean');
    return this.events.reserveAgencyQuota(request.identity.subject, workspaceId, body.eventId, body.referenceKey, body.credits, body.allowPartial === true);
  }

  @Get('/:workspaceId/quota')
  quota(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string) { return this.events.agencyQuotaSummary(request.identity.subject, workspaceId); }

  @Post('/:workspaceId/quota/:referenceKey/:action')
  finalizeQuota(@Req() request: AuthRequest, @Param('workspaceId') workspaceId: string, @Param('referenceKey') referenceKey: string, @Param('action') action: string) {
    if (action !== 'consume' && action !== 'release') throw new BadRequestException('action must be consume or release');
    return this.events.finalizeAgencyQuotaReservation(request.identity.subject, workspaceId, referenceKey, action === 'consume' ? 'CONSUMED' : 'RELEASED');
  }
}
