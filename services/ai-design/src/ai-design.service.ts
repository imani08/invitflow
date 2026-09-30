import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AiDesignJobStatus, Prisma } from '../generated/prisma/client.js';
import { DesignsClient } from './designs-client.js';
import { ComfyUIImageProvider } from './comfy-image-provider.js';
import { PrismaService } from './prisma.service.js';
import { PreviewStorage } from './preview-storage.js';
import { applyDesignChanges, MockAIProvider, SelfHostedAIProvider, selectedProvider, type JsonObject } from './providers.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxAttempts = 3;

function inputObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Le corps de la requête est invalide.');
  return value as Record<string, unknown>;
}

function promptText(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 8 || value.trim().length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001f\u007f]/.test(value)) throw new BadRequestException('Décrivez le style souhaité en 8 à 2 000 caractères.');
  return value.trim();
}

function shortModelError(error: unknown) {
  if (error && typeof error === 'object' && 'getStatus' in error && typeof error.getStatus === 'function' && error.getStatus() === 503) return 'provider_unavailable';
  if (error instanceof BadRequestException) return 'invalid_proposal';
  return 'generation_failed';
}

@Injectable()
export class AiDesignService {
  constructor(private readonly prisma: PrismaService, private readonly designs: DesignsClient, private readonly images: ComfyUIImageProvider, private readonly previews: PreviewStorage) { selectedProvider(); }

  async create(eventId: string, designId: string, ownerSubject: string, authorization: string, body: unknown) {
    if (!uuidPattern.test(eventId) || !uuidPattern.test(designId)) throw new NotFoundException('Design introuvable.');
    const input = inputObject(body);
    if (Object.keys(input).some((key) => key !== 'prompt')) throw new BadRequestException('Seul le champ prompt est autorisé.');
    const prompt = promptText(input['prompt']);
    const design = await this.designs.get(eventId, designId, authorization);
    if (!Number.isInteger(design.version) || design.version < 1) throw new BadRequestException('La version du design est invalide.');
    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.aiDesignJob.create({ data: {
        ownerSubject, eventId, designId, baseVersion: design.version, prompt,
        sourceDocument: design.document as Prisma.InputJsonValue,
        deliveryAfter: new Date(Date.now() + 30_000),
      } });
      await tx.outboxMessage.create({ data: { eventType: 'ai.design.requested.v1', aggregateId: created.id, payload: { jobId: created.id, eventId, designId } } });
      await tx.outboxMessage.create({ data: { eventType: 'ai.design.job-queued.v1', aggregateId: created.id, payload: { jobId: created.id, eventId, designId, baseVersion: design.version } } });
      return created;
    });
    return this.publicJob(job);
  }

  async list(eventId: string, designId: string, ownerSubject: string, authorization: string) {
    await this.designs.get(eventId, designId, authorization);
    const items = await this.prisma.aiDesignJob.findMany({ where: { ownerSubject, eventId, designId }, orderBy: { createdAt: 'desc' }, take: 30 });
    return { items: items.map((item) => this.publicJob(item)) };
  }

  async get(eventId: string, designId: string, jobId: string, ownerSubject: string, authorization: string) {
    await this.designs.get(eventId, designId, authorization);
    if (!uuidPattern.test(jobId)) throw new NotFoundException('Proposition IA introuvable.');
    const job = await this.prisma.aiDesignJob.findFirst({ where: { id: jobId, eventId, designId, ownerSubject } });
    if (!job) throw new NotFoundException('Proposition IA introuvable.');
    return this.publicJob(job);
  }

  async cancel(eventId: string, designId: string, jobId: string, ownerSubject: string, authorization: string) {
    await this.designs.get(eventId, designId, authorization);
    if (!uuidPattern.test(jobId)) throw new NotFoundException('Proposition IA introuvable.');
    const job = await this.prisma.$transaction(async (tx) => {
      const current = await tx.aiDesignJob.findFirst({ where: { id: jobId, eventId, designId, ownerSubject } });
      if (!current) throw new NotFoundException('Proposition IA introuvable.');
      if (current.status !== AiDesignJobStatus.QUEUED) throw new ConflictException('Seule une demande en attente peut être annulée.');
      const cancelled = await tx.aiDesignJob.updateMany({ where: { id: jobId, eventId, designId, ownerSubject, status: AiDesignJobStatus.QUEUED }, data: { status: AiDesignJobStatus.CANCELLED, completedAt: new Date() } });
      if (!cancelled.count) throw new ConflictException('La demande a déjà commencé.');
      await tx.outboxMessage.create({ data: { eventType: 'ai.design.job-cancelled.v1', aggregateId: jobId, payload: { jobId, eventId, designId } } });
      return tx.aiDesignJob.findFirstOrThrow({ where: { id: jobId, ownerSubject } });
    });
    return this.publicJob(job);
  }

  async retry(eventId: string, designId: string, jobId: string, ownerSubject: string, authorization: string) {
    await this.designs.get(eventId, designId, authorization);
    if (!uuidPattern.test(jobId)) throw new NotFoundException('Proposition IA introuvable.');
    const job = await this.prisma.$transaction(async (tx) => {
      const current = await tx.aiDesignJob.findFirst({ where: { id: jobId, eventId, designId, ownerSubject } });
      if (!current) throw new NotFoundException('Proposition IA introuvable.');
      if (current.status !== AiDesignJobStatus.FAILED) throw new ConflictException('Seule une demande en échec peut être relancée.');
      if (current.attempt >= maxAttempts) throw new ConflictException('Cette demande a atteint sa limite de tentatives.');
      const updated = await tx.aiDesignJob.updateMany({ where: { id: jobId, ownerSubject, status: AiDesignJobStatus.FAILED }, data: { status: AiDesignJobStatus.QUEUED, deliveryAfter: new Date(Date.now() + 30_000), startedAt: null, completedAt: null, errorCode: null, summary: null, proposal: Prisma.DbNull } });
      if (!updated.count) throw new ConflictException('La demande a déjà changé d’état.');
      await tx.outboxMessage.create({ data: { eventType: 'ai.design.requested.v1', aggregateId: jobId, payload: { jobId, eventId, designId } } });
      await tx.outboxMessage.create({ data: { eventType: 'ai.design.job-retried.v1', aggregateId: jobId, payload: { jobId, eventId, designId, attempt: current.attempt } } });
      return tx.aiDesignJob.findFirstOrThrow({ where: { id: jobId, ownerSubject } });
    });
    return this.publicJob(job);
  }

  async process(jobId: string) {
    if (!uuidPattern.test(jobId)) return;
    const now = new Date();
    const claim = await this.prisma.aiDesignJob.updateMany({ where: { id: jobId, status: AiDesignJobStatus.QUEUED, attempt: { lt: maxAttempts } }, data: { status: AiDesignJobStatus.PROCESSING, startedAt: now, attempt: { increment: 1 }, errorCode: null } });
    if (!claim.count) return;
    const job = await this.prisma.aiDesignJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    let previewObjectKey: string | null = null;
    try {
      const providerMode = selectedProvider();
      const provider = providerMode === 'mock' ? new MockAIProvider() : new SelfHostedAIProvider();
      const input = { prompt: job.prompt, document: job.sourceDocument as JsonObject };
      const result = await provider.edit(input);
      const proposal = applyDesignChanges(input.document, result.summary, result.changes);
      const previewPrompt = `Invitation background art direction. ${job.prompt}. Palette: ${((proposal.document['theme'] as JsonObject)['tokens'] as JsonObject)['primary']}, ${((proposal.document['theme'] as JsonObject)['tokens'] as JsonObject)['secondary']}, ${((proposal.document['theme'] as JsonObject)['tokens'] as JsonObject)['background']}. Preserve generous negative space for invitation text.`;
      previewObjectKey = providerMode === 'self-hosted' ? await this.previews.put(job.eventId, job.designId, job.id, await this.images.generate({ prompt: previewPrompt })) : null;
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt: now }, data: {
          status: AiDesignJobStatus.PROPOSED, provider: providerMode, summary: proposal.summary,
          proposal: { document: proposal.document, changes: proposal.changes } as Prisma.InputJsonValue,
          previewObjectKey,
          completedAt: new Date(), errorCode: null,
        } });
        if (updated.count) await tx.outboxMessage.create({ data: { eventType: 'ai.design.proposal-ready.v1', aggregateId: job.id, payload: { jobId: job.id, eventId: job.eventId, designId: job.designId, baseVersion: job.baseVersion, provider: providerMode } } });
      });
      const latest = await this.prisma.aiDesignJob.findUnique({ where: { id: job.id }, select: { status: true } });
      if (latest?.status !== AiDesignJobStatus.PROPOSED && previewObjectKey) await this.previews.delete(previewObjectKey);
    } catch (error) {
      if (previewObjectKey) await this.previews.delete(previewObjectKey).catch(() => undefined);
      const errorCode = shortModelError(error);
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt: now }, data: { status: AiDesignJobStatus.FAILED, errorCode, completedAt: new Date() } });
        if (updated.count) await tx.outboxMessage.create({ data: { eventType: 'ai.design.job-failed.v1', aggregateId: job.id, payload: { jobId: job.id, eventId: job.eventId, designId: job.designId, errorCode } } });
      });
      console.warn(JSON.stringify({ level: 'warn', event: 'ai_design_job_failed', jobId: job.id, errorCode }));
    }
  }

  async preview(eventId: string, designId: string, jobId: string, ownerSubject: string, authorization: string) {
    await this.designs.get(eventId, designId, authorization);
    if (!uuidPattern.test(jobId)) throw new NotFoundException('Aperçu introuvable.');
    const job = await this.prisma.aiDesignJob.findFirst({ where: { id: jobId, eventId, designId, ownerSubject, status: AiDesignJobStatus.PROPOSED }, select: { previewObjectKey: true } });
    if (!job?.previewObjectKey) throw new NotFoundException('Aperçu introuvable.');
    return this.previews.get(job.previewObjectKey);
  }

  private publicJob(job: {
    id: string; eventId: string; designId: string; baseVersion: number; prompt: string; summary: string | null;
    proposal: Prisma.JsonValue | null; provider: string | null; status: AiDesignJobStatus; attempt: number;
    errorCode: string | null; createdAt: Date; updatedAt: Date; startedAt: Date | null; completedAt: Date | null; previewObjectKey: string | null;
  }) {
    const proposal = job.proposal && typeof job.proposal === 'object' && !Array.isArray(job.proposal) ? job.proposal as Prisma.JsonObject : null;
    return {
      id: job.id, eventId: job.eventId, designId: job.designId, baseVersion: job.baseVersion, prompt: job.prompt,
      summary: job.summary, proposal: proposal ? { document: proposal['document'] ?? null, changes: proposal['changes'] ?? [] } : null,
      provider: job.provider, status: job.status, attempt: job.attempt, errorCode: job.errorCode,
      createdAt: job.createdAt, updatedAt: job.updatedAt, startedAt: job.startedAt, completedAt: job.completedAt, previewAvailable: Boolean(job.previewObjectKey),
    };
  }
}
