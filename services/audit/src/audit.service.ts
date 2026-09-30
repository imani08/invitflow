import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ModerationStatus, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

type RecordObject = Record<string, unknown>;
type AuditEnvelope = { eventId?: unknown; eventType?: unknown; occurredAt?: unknown; payload?: unknown };
const eventName = /^[a-z][a-z0-9.-]{1,118}\.v[1-9][0-9]*$/;
const ACTIVE_REPORT_STATUSES: ModerationStatus[] = [ModerationStatus.OPEN, ModerationStatus.IN_REVIEW];
const metadataKeys = ['eventId', 'guestId', 'guestCount', 'groupId', 'designId', 'invitationId', 'batchId', 'paymentId', 'orderId', 'jobId', 'ceremonyId', 'status', 'responseCount', 'importedCount', 'skippedCount', 'credits', 'version', 'reasonCode'];
const obj = (value: unknown): RecordObject => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordObject : {};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  private reportReceipt(report: { id: string; resourceType: string; resourceId: string; reasonCode: string; status: ModerationStatus; createdAt: Date }) { return { id: report.id, resourceType: report.resourceType, resourceId: report.resourceId, reasonCode: report.reasonCode, status: report.status, createdAt: report.createdAt }; }

  async record(sourceEventId: string, envelope: AuditEnvelope) {
    if (typeof envelope.eventType !== 'string' || !eventName.test(envelope.eventType)) return;
    const payload = obj(envelope.payload); const occurredAt = typeof envelope.occurredAt === 'string' && Number.isFinite(Date.parse(envelope.occurredAt)) ? new Date(envelope.occurredAt) : new Date();
    const rawActor = payload['ownerSubject'] ?? payload['actorSubject']; const actorSubject = typeof rawActor === 'string' && rawActor.length <= 255 ? rawActor : null;
    const resourceId = ['eventId', 'guestId', 'designId', 'invitationId', 'batchId', 'paymentId', 'orderId', 'jobId'].map(key => payload[key]).find(value => typeof value === 'string' && value.length <= 255) as string | undefined;
    const metadata: RecordObject = {};
    for (const key of metadataKeys) { const value = payload[key]; if ((typeof value === 'string' && value.length <= 120) || (typeof value === 'number' && Number.isSafeInteger(value))) metadata[key] = value; }
    await this.prisma.auditEvent.createMany({ data: [{ sourceEventId, eventType: envelope.eventType, actorSubject, resourceId: resourceId ?? null, occurredAt, metadata: metadata as Prisma.InputJsonValue }], skipDuplicates: true });
  }

  async list(input: { limit?: string; cursor?: string; eventType?: string; actorSubject?: string }) {
    const limit = input.limit === undefined ? 50 : Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('La limite doit être comprise entre 1 et 100.');
    if (input.eventType !== undefined && !eventName.test(input.eventType)) throw new BadRequestException('Le type d’événement est invalide.');
    if (input.actorSubject !== undefined && (input.actorSubject.length < 1 || input.actorSubject.length > 255)) throw new BadRequestException('Le sujet utilisateur est invalide.');
    if (input.cursor && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.cursor)) throw new BadRequestException('Le curseur est invalide.');
    if (input.cursor && !(await this.prisma.auditEvent.findUnique({ where: { id: input.cursor }, select: { id: true } }))) throw new BadRequestException('Le curseur ne correspond pas à une entrée.');
    const where = { ...(input.eventType ? { eventType: input.eventType } : {}), ...(input.actorSubject ? { actorSubject: input.actorSubject } : {}) };
    const rows = await this.prisma.auditEvent.findMany({ where, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}) });
    const hasMore = rows.length > limit; const items = rows.slice(0, limit);
    return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async createReport(reporterSubject: string, idempotencyKey: string, raw: unknown) {
    if (!/^[A-Za-z0-9._:@/-]{1,200}$/.test(idempotencyKey ?? '')) throw new BadRequestException('Idempotency-Key obligatoire et invalide.');
    const input = obj(raw); const allowed = ['resourceType', 'resourceId', 'reasonCode', 'description'];
    if (Object.keys(input).some(key => !allowed.includes(key)) || !['EVENT', 'GUEST', 'INVITATION'].includes(String(input['resourceType'])) || typeof input['resourceId'] !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input['resourceId']) || !['INAPPROPRIATE_CONTENT', 'FRAUD', 'HARASSMENT', 'OTHER'].includes(String(input['reasonCode'])) || typeof input['description'] !== 'string' || input['description'].trim().length < 10 || input['description'].trim().length > 1000) throw new BadRequestException('Les informations du signalement sont invalides.');
    const existing = await this.prisma.moderationReport.findUnique({ where: { reporterSubject_idempotencyKey: { reporterSubject, idempotencyKey } } }); if (existing) return this.reportReceipt(existing);
    const active = await this.prisma.moderationReport.findFirst({ where: { reporterSubject, resourceType: input['resourceType'] as string, resourceId: input['resourceId'] as string, status: { in: ACTIVE_REPORT_STATUSES } } }); if (active) return this.reportReceipt(active);
    const reportId = randomUUID(); const occurredAt = new Date();
    try { return await this.prisma.$transaction(async tx => {
      const report = await tx.moderationReport.create({ data: { id: reportId, reporterSubject, idempotencyKey, resourceType: input['resourceType'] as string, resourceId: input['resourceId'] as string, reasonCode: input['reasonCode'] as string, description: (input['description'] as string).trim() } });
      await tx.auditEvent.create({ data: { sourceEventId: `report:${reportId}`, eventType: 'moderation.report.created.v1', actorSubject: reporterSubject, resourceId: report.resourceId, occurredAt, metadata: { reportId, resourceType: report.resourceType, reasonCode: report.reasonCode, status: report.status } } });
      return this.reportReceipt(report);
    }); } catch (error) { const prior = await this.prisma.moderationReport.findUnique({ where: { reporterSubject_idempotencyKey: { reporterSubject, idempotencyKey } } }) ?? await this.prisma.moderationReport.findFirst({ where: { reporterSubject, resourceType: input['resourceType'] as string, resourceId: input['resourceId'] as string, status: { in: ACTIVE_REPORT_STATUSES } } }); if (prior) return this.reportReceipt(prior); throw error; }
  }

  async listReports(input: { status?: string; limit?: string; cursor?: string }) {
    const status = input.status ?? 'ACTIVE'; if (status !== 'ACTIVE' && !Object.values(ModerationStatus).includes(status as ModerationStatus)) throw new BadRequestException('Le statut de modération est invalide.');
    const limit = input.limit === undefined ? 50 : Number(input.limit); if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('La limite doit être comprise entre 1 et 100.');
    if (input.cursor && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.cursor)) throw new BadRequestException('Le curseur est invalide.');
    if (input.cursor && !(await this.prisma.moderationReport.findUnique({ where: { id: input.cursor }, select: { id: true } }))) throw new BadRequestException('Le curseur ne correspond pas à un dossier.');
    const rows = await this.prisma.moderationReport.findMany({ where: { status: status === 'ACTIVE' ? { in: [ModerationStatus.OPEN, ModerationStatus.IN_REVIEW] } : status as ModerationStatus }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}) });
    const hasMore = rows.length > limit; const items = rows.slice(0, limit); return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async reviewReport(adminSubject: string, id: string, raw: unknown) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundException('Dossier introuvable.');
    const input = obj(raw); const next = input['status']; const note = input['resolutionNote'];
    if (Object.keys(input).some(key => !['status', 'resolutionNote'].includes(key)) || !['IN_REVIEW', 'RESOLVED', 'DISMISSED'].includes(String(next)) || (note !== undefined && (typeof note !== 'string' || note.trim().length > 500)) || (['RESOLVED', 'DISMISSED'].includes(String(next)) && (typeof note !== 'string' || note.trim().length < 5))) throw new BadRequestException('Décision de modération invalide.');
    return this.prisma.$transaction(async tx => {
      const current = await tx.moderationReport.findUnique({ where: { id } }); if (!current) throw new NotFoundException('Dossier introuvable.');
      if (!ACTIVE_REPORT_STATUSES.includes(current.status)) throw new ConflictException('Ce dossier est déjà clôturé.');
      const changed = await tx.moderationReport.updateMany({ where: { id, status: { in: ACTIVE_REPORT_STATUSES } }, data: { status: next as ModerationStatus, reviewedBy: adminSubject, resolutionNote: typeof note === 'string' ? note.trim() || null : null } });
      if (!changed.count) throw new ConflictException('Le dossier a été modifié par un autre membre de l’équipe.');
      await tx.auditEvent.create({ data: { sourceEventId: `moderation:${randomUUID()}`, eventType: 'moderation.report.reviewed.v1', actorSubject: adminSubject, resourceId: current.resourceId, occurredAt: new Date(), metadata: { reportId: current.id, resourceType: current.resourceType, reasonCode: current.reasonCode, status: next as string } } });
      return tx.moderationReport.findUniqueOrThrow({ where: { id } });
    });
  }

  sourceFallback(payload: string) { return createHash('sha256').update(payload).digest('hex'); }
}
