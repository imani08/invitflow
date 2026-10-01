import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AccessScanOutcome, AgentStatus } from '../generated/prisma/client.js';
import { EventsClient } from './events-client.js';
import { isUuid, requiredEnv } from './env.js';
import { PrismaService } from './prisma.service.js';

type ScanInput = { token: string; ceremonyId: string; companionCount?: number };
const subjectPattern = /^[^\s\u0000-\u001f\u007f]{1,255}$/;

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventsClient) {}

  async listAgents(owner: string, eventId: string, authorization: string) {
    this.assertIds(eventId);
    await this.events.assertManageableCeremonies(eventId, [], authorization);
    const agents = await this.prisma.checkInAgent.findMany({
      where: { ownerSubject: owner, eventId }, orderBy: { createdAt: 'asc' },
      include: { ceremonies: { orderBy: { ceremonyId: 'asc' }, select: { ceremonyId: true, createdAt: true } } },
    });
    return { items: agents.map(({ id, agentSubject, status, createdAt, updatedAt, ceremonies }) => ({ id, agentSubject, status, createdAt, updatedAt, ceremonies })) };
  }

  async getAgentContext(subject: string, eventId: string, authorization: string) {
    this.assertIds(eventId);
    const agent = await this.prisma.checkInAgent.findFirst({
      where: { eventId, agentSubject: subject, status: AgentStatus.ACTIVE },
      include: { ceremonies: { orderBy: { ceremonyId: 'asc' }, select: { ceremonyId: true } } },
    });
    if (agent) {
      const ceremonyIds = agent.ceremonies.map((grant) => grant.ceremonyId);
      if (!ceremonyIds.length) throw new ForbiddenException('Aucune cérémonie de cet événement ne vous est assignée.');
      return { eventId, name: '', ceremonies: ceremonyIds.map((id) => ({ id, name: 'Cérémonie autorisée' })) };
    }
    const event = await this.events.assertManageableCeremonies(eventId, [], authorization);
    return { eventId, name: typeof event['name'] === 'string' ? event['name'] : '', ceremonies: (event['ceremonies'] as Record<string, unknown>[]).map((ceremony) => ({ id: ceremony['id'], name: ceremony['name'], startAt: ceremony['startAt'] })) };
  }

  async removeCeremonyGrant(owner: string, eventId: string, agentSubject: string, ceremonyId: string, authorization: string) {
    this.assertIds(eventId, ceremonyId);
    if (!subjectPattern.test(agentSubject) || ['null', 'undefined'].includes(agentSubject.toLowerCase())) throw new BadRequestException('Identifiant d’agent invalide.');
    await this.events.assertManageableCeremonies(eventId, [ceremonyId], authorization);
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.checkInAgent.findFirst({ where: { ownerSubject: owner, eventId, agentSubject } });
      if (!agent) throw new NotFoundException('Agent introuvable.');
      await tx.agentCeremonyGrant.deleteMany({ where: { agentId: agent.id, ceremonyId } });
      const remaining = await tx.agentCeremonyGrant.count({ where: { agentId: agent.id } });
      if (remaining === 0) await tx.checkInAgent.update({ where: { id: agent.id }, data: { status: AgentStatus.REVOKED } });
      await tx.outboxMessage.create({ data: { eventType: 'access.agent.ceremony-revoked.v1', aggregateId: agent.id, payload: { eventId, agentSubject, ceremonyId, ownerSubject: owner, correlationId: randomUUID(), schemaVersion: 1 } } });
      return { id: agent.id, agentSubject, ceremonyId, status: remaining === 0 ? AgentStatus.REVOKED : AgentStatus.ACTIVE };
    });
  }

  async getScanSummary(subject: string, eventId: string, ceremonyId: string, authorization: string) {
    this.assertIds(eventId, ceremonyId);
    const grant = await this.prisma.agentCeremonyGrant.findFirst({ where: { eventId, ceremonyId, agent: { agentSubject: subject, status: AgentStatus.ACTIVE } } });
    let owner = subject;
    if (grant) owner = grant.ownerSubject;
    else {
      try { await this.events.assertCeremonies(eventId, [ceremonyId], authorization); }
      catch (error) { if (error instanceof NotFoundException) throw new ForbiddenException('Accès au résumé de pointage refusé.'); throw error; }
    }
    const url = `${requiredEnv('INVITATIONS_SERVICE_URL').replace(/\/$/, '')}/v1/internal/events/${eventId}/check-in/summary?ceremonyId=${encodeURIComponent(ceremonyId)}`;
    let response: Response;
    try { response = await fetch(url, { headers: { 'x-service-token': requiredEnv('INVITATIONS_INTERNAL_TOKEN'), 'x-event-owner-subject': owner }, cache: 'no-store', signal: AbortSignal.timeout(5_000) }); }
    catch { throw new ServiceUnavailableException('Invitations service is unavailable'); }
    if (response.status >= 500) throw new ServiceUnavailableException('Invitations service request failed');
    if (response.status === 404) throw new NotFoundException('Check-in summary not found');
    if (response.status === 403) throw new ForbiddenException('Check-in summary access denied');
    if (response.status === 400) throw new BadRequestException('Invalid check-in summary request');
    if (!response.ok) throw new ServiceUnavailableException('Invitations service request failed');
    return response.json();
  }

  async assignAgent(owner: string, eventId: string, agentSubject: unknown, ceremonyIds: unknown, authorization: string) {
    this.assertIds(eventId);
    if (typeof agentSubject !== 'string' || !subjectPattern.test(agentSubject) || agentSubject === owner || ['null', 'undefined'].includes(agentSubject.toLowerCase()))
      throw new BadRequestException('Identifiant d’agent invalide.');
    if (!Array.isArray(ceremonyIds) || ceremonyIds.length < 1 || ceremonyIds.length > 100 || ceremonyIds.some((id) => typeof id !== 'string' || !isUuid(id)) || new Set(ceremonyIds).size !== ceremonyIds.length)
      throw new BadRequestException('La liste des cérémonies est invalide.');
    const event = await this.events.assertManageableCeremonies(eventId, ceremonyIds as string[], authorization);
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.checkInAgent.upsert({
        where: { eventId_agentSubject: { eventId, agentSubject } },
        create: { ownerSubject: owner, eventId, agentSubject },
        update: { ownerSubject: owner, status: AgentStatus.ACTIVE },
      });
      await tx.agentCeremonyGrant.deleteMany({ where: { agentId: agent.id } });
      await tx.agentCeremonyGrant.createMany({ data: (ceremonyIds as string[]).map((ceremonyId) => ({ agentId: agent.id, ownerSubject: owner, eventId, ceremonyId })) });
      await tx.outboxMessage.create({ data: { eventType: 'access.agent.assigned.v1', aggregateId: agent.id, payload: { eventId, agentSubject, ceremonyIds, ownerSubject: owner, correlationId: randomUUID(), schemaVersion: 1 } } });
      const names = new Map((event['ceremonies'] as Record<string, unknown>[]).map((ceremony) => [ceremony['id'], ceremony['name']]));
      return { id: agent.id, agentSubject: agent.agentSubject, status: agent.status, ceremonies: (ceremonyIds as string[]).map((id) => ({ id, name: names.get(id) })) };
    });
  }

  async revokeAgent(owner: string, eventId: string, agentSubject: string, authorization: string) {
    this.assertIds(eventId);
    if (!subjectPattern.test(agentSubject) || ['null', 'undefined'].includes(agentSubject.toLowerCase())) throw new BadRequestException('Identifiant d’agent invalide.');
    await this.events.assertManageableCeremonies(eventId, [], authorization);
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.checkInAgent.findFirst({ where: { ownerSubject: owner, eventId, agentSubject } });
      if (!agent) throw new NotFoundException('Agent introuvable.');
      await tx.checkInAgent.update({ where: { id: agent.id }, data: { status: AgentStatus.REVOKED } });
      await tx.agentCeremonyGrant.deleteMany({ where: { agentId: agent.id } });
      await tx.outboxMessage.create({ data: { eventType: 'access.agent.revoked.v1', aggregateId: agent.id, payload: { eventId, agentSubject, ownerSubject: owner, correlationId: randomUUID(), schemaVersion: 1 } } });
      return { id: agent.id, agentSubject, status: AgentStatus.REVOKED };
    });
  }

  async scan(operator: string, eventId: string, input: ScanInput, authorization: string, deviceId?: string, userAgent?: string) {
    this.assertIds(eventId, input?.ceremonyId);
    if (!input || typeof input.token !== 'string' || input.token.length < 80 || input.token.length > 2048 || (input.companionCount !== undefined && (!Number.isInteger(input.companionCount) || input.companionCount < 0 || input.companionCount > 20)))
      throw new BadRequestException('Données de scan invalides.');
    const grant = await this.prisma.agentCeremonyGrant.findFirst({
      where: { eventId, ceremonyId: input.ceremonyId, agent: { agentSubject: operator, status: AgentStatus.ACTIVE } },
      include: { agent: true },
    });
    let owner = grant?.ownerSubject;
    if (!owner) {
      try { await this.events.assertCeremonies(eventId, [input.ceremonyId], authorization); owner = operator; }
      catch (error) { if (error instanceof NotFoundException) throw new ForbiddenException('Accès de pointage refusé.'); throw error; }
    }
    let status = 200;
    let result: unknown;
    let outcome: AccessScanOutcome = AccessScanOutcome.ACCEPTED;
    try {
      const response = await fetch(`${requiredEnv('INVITATIONS_SERVICE_URL').replace(/\/$/, '')}/v1/internal/events/${eventId}/check-in/scan`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-service-token': requiredEnv('INVITATIONS_INTERNAL_TOKEN'), 'x-event-owner-subject': owner, 'x-checkin-operator-subject': operator },
        body: JSON.stringify({ ceremonyId: input.ceremonyId, token: input.token, companionCount: input.companionCount ?? 0 }), cache: 'no-store', signal: AbortSignal.timeout(8_000),
      });
      status = response.status;
      result = await response.json().catch(() => ({ message: 'Réponse de pointage invalide.' }));
      outcome = response.ok ? ((result as { alreadyCheckedIn?: boolean }).alreadyCheckedIn ? AccessScanOutcome.DUPLICATE : AccessScanOutcome.ACCEPTED) : AccessScanOutcome.REJECTED;
      if (response.status >= 500) outcome = AccessScanOutcome.UNAVAILABLE;
    } catch {
      status = 503; outcome = AccessScanOutcome.UNAVAILABLE; result = { message: 'Le service de pointage est indisponible.' };
    }
    await this.prisma.accessScanAttempt.create({ data: {
      ownerSubject: owner, eventId, ceremonyId: input.ceremonyId, operatorSubject: operator,
      agentId: grant?.agentId ?? null,
      deviceFingerprint: deviceId && deviceId.length <= 200 ? createHash('sha256').update(deviceId).digest('hex') : null,
      userAgent: userAgent?.slice(0, 300) ?? null, outcome, upstreamStatus: status,
    } }).catch(() => undefined);
    if (status >= 500) throw new ServiceUnavailableException((result as { message?: string })?.message ?? 'Le service de pointage est indisponible.');
    if (status === 404) throw new NotFoundException((result as { message?: string })?.message ?? 'Invitation introuvable.');
    if (status === 403) throw new ForbiddenException((result as { message?: string })?.message ?? 'Pointage refusé.');
    if (status === 400) throw new BadRequestException((result as { message?: string })?.message ?? 'Données de scan invalides.');
    if (status === 409) throw new ConflictException((result as { message?: string })?.message ?? 'Pointage en conflit.');
    return result;
  }

  private assertIds(...ids: (string | undefined)[]) { if (ids.some((id) => !id || !isUuid(id))) throw new BadRequestException('Identifiant invalide.'); }
}
