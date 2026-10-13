import { editorialTarget, protectedEditorialTerms, redactEditorial, restoreEditorial, validateEditorialProposal } from '@invitaflow/design-document';
import { OpenAITextProvider, OpenAIEditorialProvider } from './openai-provider.js';
import { FluxImageProvider, type FluxTask } from './flux-image-provider.js';
import { SelfHostedEditorialProvider } from './editorial-provider.js';
import { ServiceUnavailableException, BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { AiDesignJobStatus, Prisma } from '../generated/prisma/client.js';
import { DesignsClient } from './designs-client.js';
import { ComfyUIImageProvider } from './comfy-image-provider.js';
import { PrismaService } from './prisma.service.js';
import { PreviewStorage } from './preview-storage.js';
import { applyDesignChanges, MockAIProvider, SelfHostedAIProvider, selectedProvider, type JsonObject } from './providers.js';
import { aiJobLimits } from './env.js';
import { aiActiveQuotaRejection, aiQuotaRejection } from './ai-job-quota.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxAttempts = 3;
const editorialLayoutKey = (layer: Record<string, unknown>) => JSON.stringify(['x', 'y', 'width', 'height', 'minFontSize', 'preferredFontSize', 'maxLines', 'fontId', 'lineHeight'].map(key => layer[key] ?? null));

function inputObject(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Le corps de la requête est invalide.');
  return value as Record<string, unknown>;
}

function promptText(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 8 || value.trim().length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001f\u007f]/.test(value)) throw new BadRequestException('Décrivez le style souhaité en 8 à 2 000 caractères.');
  return value.trim();
}

function shortModelError(error: unknown) {
  if (error instanceof Error && /incertain/.test(error.message)) return 'submission_uncertain';
  if (error && typeof error === 'object' && 'getStatus' in error && typeof error.getStatus === 'function' && error.getStatus() === 503) return 'provider_unavailable';
  if (error instanceof Error && error.message === 'submission_uncertain') return 'submission_uncertain';
  if (error instanceof BadRequestException) return 'invalid_proposal';
  return 'generation_failed';
}

@Injectable()
export class AiDesignService {
  constructor(private readonly prisma: PrismaService, private readonly designs: DesignsClient, private readonly images: ComfyUIImageProvider, private readonly previews: PreviewStorage) { selectedProvider(); }

  async create(eventId: string, designId: string, ownerSubject: string, authorization: string, body: unknown) {
    if (!uuidPattern.test(eventId) || !uuidPattern.test(designId)) throw new NotFoundException('Design introuvable.');
    const input = inputObject(body);
    if (['EDITORIAL_COMPRESSION', 'EDITORIAL_REWRITE'].includes(String(input['workflow']))) return this.createEditorial(eventId, designId, ownerSubject, authorization, input);
    if (Object.keys(input).some((key) => !['prompt', 'generateImage', 'elementIds'].includes(key)) || input['generateImage'] !== undefined && typeof input['generateImage'] !== 'boolean') throw new BadRequestException('Champs de proposition invalides.');
    if (input['generateImage'] && (selectedProvider() !== 'openai' || process.env['AI_IMAGE_PROVIDER'] !== 'flux' || !process.env['BFL_API_KEY'])) throw new ServiceUnavailableException('FLUX non configuré. Choisissez un modèle existant ou une proposition sans nouveau décor.');
    if (selectedProvider() === 'openai' && !process.env['OPENAI_API_KEY']) throw new ServiceUnavailableException('GPT non configuré. La saisie manuelle et les modèles existants restent disponibles.');
    let prompt = (input['generateImage'] ? 'VISUAL_VARIATION\n' : '') + promptText(input['prompt']);
    const design = await this.designs.get(eventId, designId, authorization);
    if (!Number.isInteger(design.version) || design.version < 1) throw new BadRequestException('La version du design est invalide.');
    const source = structuredClone(design.document) as JsonObject;
    const ids = input['elementIds'];
    if (ids !== undefined) {
      const elements = source['elements'] as JsonObject[];
      if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string' || !elements.some(layer => layer['id'] === id && layer['locked'] !== true && layer['editable'] === true))) throw new BadRequestException('Sélectionnez des calques existants et déverrouillés.');
      if (input['generateImage'] && (ids.length !== 1 || !elements.some(layer => layer['id'] === ids[0] && ['IMAGE','SHAPE'].includes(String(layer['type']))))) throw new BadRequestException('Choisissez une seule image ou décoration pour générer une ressource.');
      const scope = [...new Set(ids)].sort();
      source['metadata'] = { ...(source['metadata'] as JsonObject), aiEditScope: scope };
      prompt += '\nPortée sélectionnée : ' + scope.join(', ');
    }

    const job = await this.prisma.$transaction(async (tx) => {
      await this.lockQuotaRows(tx, ownerSubject);
      const previous = await tx.aiDesignJob.findFirst({ where: { ownerSubject, eventId, designId, baseVersion: design.version, prompt, status: { in: [AiDesignJobStatus.QUEUED, AiDesignJobStatus.PROCESSING, AiDesignJobStatus.PROPOSED, AiDesignJobStatus.FAILED] } }, orderBy: { createdAt: 'desc' } });
      if (previous) return previous;
      const eventRequests = await tx.aiDesignJob.count({ where: { ownerSubject, eventId, createdAt: { gte: new Date(Date.now() - 3600000) } } });
      const limits = aiJobLimits();
      if (eventRequests >= limits.requestsPerHourPerEvent) throw new HttpException('Limite horaire de propositions atteinte pour cet événement.', 429);
      const activeStatuses = [AiDesignJobStatus.QUEUED, AiDesignJobStatus.PROCESSING];
      const [ownerActive, globalActive, recentRequests] = await Promise.all([
        tx.aiDesignJob.count({ where: { ownerSubject, status: { in: activeStatuses } } }),
        tx.aiDesignJob.count({ where: { status: { in: activeStatuses } } }),
        tx.aiDesignJob.count({ where: { ownerSubject, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } }),
      ]);
      this.rejectQuota(aiQuotaRejection({ activeOwner: ownerActive, activeGlobal: globalActive, requestsLastHour: recentRequests }, limits));
      const created = await tx.aiDesignJob.create({ data: {
        ownerSubject, eventId, designId, baseVersion: design.version, prompt,
        sourceDocument: source as Prisma.InputJsonValue,
        deliveryAfter: new Date(Date.now() + 30_000),
      } });
      await tx.outboxMessage.create({ data: { eventType: 'ai.design.requested.v1', aggregateId: created.id, payload: { jobId: created.id, eventId, designId } } });
      await tx.outboxMessage.create({ data: { eventType: 'ai.design.job-queued.v1', aggregateId: created.id, payload: { jobId: created.id, eventId, designId, baseVersion: design.version } } });
      return created;
    });
    return this.publicJob(job);
  }

  private async createEditorial(eventId: string, designId: string, ownerSubject: string, authorization: string, input: Record<string, unknown>) {
    if (Object.keys(input).some(key => !['workflow', 'action', 'elementId', 'language', 'tone', 'compressionLevel', 'sourceVersion', 'protectedTerms'].includes(key))) throw new BadRequestException('Champs éditoriaux invalides.');
    const rewrite = input['workflow'] === 'EDITORIAL_REWRITE';
    if (selectedProvider() === 'openai' && !process.env['OPENAI_API_KEY']) throw new ServiceUnavailableException('GPT non configuré. La saisie manuelle reste disponible.');
    if (rewrite && (selectedProvider() !== 'openai' || !['GENERATE', 'REFORMULATE'].includes(String(input['action'])))) throw new ServiceUnavailableException('La rédaction GPT doit être configurée. La saisie manuelle reste disponible.');
    const context = await this.designs.editorial(eventId, designId, authorization);
    const field = context.fields.find(entry => entry.elementId === input['elementId']);
    if (!field || !rewrite && !field.target.overflow || input['sourceVersion'] !== context.sourceVersion) throw new ConflictException('Texte court, champ non éligible ou version obsolète.');
    if (!rewrite && !field.sourceText.trim() || field.sourceText.length > 12000) throw new BadRequestException('Texte éditorial limité à 12 000 caractères.');
    const level = String(input['compressionLevel']);
    const language = String(input['language']);
    const tone = String(input['tone'] ?? 'preserve');
    if (!['LIGHT', 'BALANCED', 'CONCISE'].includes(level) || !/^[a-z]{2,3}$/.test(language) || !['preserve', 'romantic', 'religious', 'traditional', 'formal', 'warm', 'elegant', 'institutional', 'friendly'].includes(tone)) throw new BadRequestException('Langue, ton ou niveau invalide.');
    let terms: string[];
    try { terms = protectedEditorialTerms(field.sourceText, input['protectedTerms'] === undefined ? field.protectedTerms : [...field.protectedTerms, ...(Array.isArray(input['protectedTerms']) ? input['protectedTerms'] : [''])]); } catch { throw new BadRequestException('Fragments protégés invalides : utilisez uniquement des fragments présents dans le texte.'); }
    const target = editorialTarget(field.layer, field.sourceText, level);
    if (rewrite) target.maxCharacters = Math.min(1500, editorialTarget(field.layer, 'x'.repeat(12000)).layoutCapacity);
    const source = { workflow: String(input['workflow']), action: rewrite ? String(input['action']) : 'SHORTEN', elementId: field.elementId, sourceText: field.sourceText, language, tone, compressionLevel: level, target, protectedTerms: terms, layer: field.layer };
    const job = await this.prisma.$transaction(async tx => {
      await this.lockQuotaRows(tx, ownerSubject);
      const previous = await tx.aiDesignJob.findFirst({ where: { ownerSubject, eventId, designId, baseVersion: context.sourceVersion, prompt: String(input['workflow']), sourceDocument: { equals: source as Prisma.InputJsonValue }, status: { in: [AiDesignJobStatus.QUEUED, AiDesignJobStatus.PROCESSING, AiDesignJobStatus.PROPOSED, AiDesignJobStatus.FAILED] } }, orderBy: { createdAt: 'desc' } });
      if (previous) return previous;
      const eventRequests = await tx.aiDesignJob.count({ where: { ownerSubject, eventId, createdAt: { gte: new Date(Date.now() - 3600000) } } });
      if (eventRequests >= aiJobLimits().requestsPerHourPerEvent) throw new HttpException('Limite horaire de propositions atteinte pour cet événement.', 429);
      const [ownerActive, globalActive, recentRequests] = await Promise.all([tx.aiDesignJob.count({ where: { ownerSubject, status: { in: [AiDesignJobStatus.QUEUED, AiDesignJobStatus.PROCESSING] } } }), tx.aiDesignJob.count({ where: { status: { in: [AiDesignJobStatus.QUEUED, AiDesignJobStatus.PROCESSING] } } }), tx.aiDesignJob.count({ where: { ownerSubject, createdAt: { gte: new Date(Date.now() - 3600000) } } })]);
      this.rejectQuota(aiQuotaRejection({ activeOwner: ownerActive, activeGlobal: globalActive, requestsLastHour: recentRequests }, aiJobLimits()));
      const proposals = await tx.aiDesignJob.count({ where: { ownerSubject, eventId, designId, baseVersion: context.sourceVersion, sourceDocument: { path: ['workflow'], equals: String(input['workflow']) } } });
      if (proposals >= 3) throw new HttpException('Limite de trois propositions pour cette version. Modifiez le texte ou la composition.', 429);
      const created = await tx.aiDesignJob.create({ data: { ownerSubject, eventId, designId, baseVersion: context.sourceVersion, prompt: String(input['workflow']), sourceDocument: source as Prisma.InputJsonValue, deliveryAfter: new Date(Date.now() + 30000) } });
      await tx.outboxMessage.create({ data: { eventType: 'ai.design.requested.v1', aggregateId: created.id, payload: { jobId: created.id, eventId, designId } } });
      return created;
    });
    return this.publicJob(job);
  }

  private async processEditorial(job: { id: string; baseVersion: number; sourceDocument: Prisma.JsonValue; proposal: Prisma.JsonValue | null }, startedAt: Date) {
    const source = job.sourceDocument as unknown as { workflow: string; action?: string; sourceText: string; protectedTerms: string[]; language: string; tone: string; compressionLevel: string; target: { maxCharacters: number; maxEstimatedLines: number; targetReductionRatio: number }; layer: Record<string, unknown>; elementId: string };
    const started = Date.now();
    try {
      const masked = redactEditorial(source['sourceText'], source['protectedTerms']);
      const editorialProvider = selectedProvider() === 'openai' ? new OpenAIEditorialProvider() : new SelfHostedEditorialProvider();
      const operation = source.workflow === 'EDITORIAL_REWRITE' && editorialProvider instanceof OpenAIEditorialProvider ? editorialProvider.rewrite.bind(editorialProvider) : editorialProvider.compress.bind(editorialProvider);
      const checkpoint = job.proposal as JsonObject | null;
      const cached = checkpoint?.['editorialResult'] as { text: string; language: string; usage: Record<string, number> | null } | undefined;
      if (!cached && selectedProvider() === 'openai' && checkpoint?.['textSubmissionStarted']) throw new Error('submission_uncertain');
      if (!cached && selectedProvider() === 'openai') {
        const marked = await this.prisma.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt }, data: { proposal: { textSubmissionStarted: true } } });
        if (!marked.count) return;
      }
      const result = cached ?? await operation({ ...(source.workflow === 'EDITORIAL_REWRITE' ? { action: source.action ?? 'REFORMULATE' } : {}), text: masked.text, language: source['language'], tone: source['tone'], compressionLevel: source['compressionLevel'], targetLength: source['target'].maxCharacters, maxEstimatedLines: source['target'].maxEstimatedLines, targetReductionRatio: source['target'].targetReductionRatio });
      if (!cached && selectedProvider() === 'openai') {
        const saved = await this.prisma.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt }, data: { proposal: { editorialResult: result } as Prisma.InputJsonValue } });
        if (!saved.count) return;
      }
      const text = restoreEditorial(result.text, masked.fragments, masked.order);
      if (source.workflow === 'EDITORIAL_COMPRESSION') validateEditorialProposal(source['sourceText'], text, source['protectedTerms'], source['target']);
      else if (!text.trim() || text.length > source.target.maxCharacters || source.protectedTerms.some(term => text.split(term).length !== source.sourceText.split(term).length) || protectedEditorialTerms(text).some(term => !source.sourceText.includes(term))) throw new Error('invalid_proposal');
      const fit = editorialTarget(source['layer'], text);
      await this.prisma.$transaction(async tx => {
        const updated = await tx.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt }, data: { status: AiDesignJobStatus.PROPOSED, provider: selectedProvider(), proposal: { workflow: source.workflow, elementId: source['elementId'], sourceText: source['sourceText'], proposedText: text, fits: !fit.overflow, usage: result.usage, elapsedMs: Date.now() - started }, completedAt: new Date(), errorCode: null } });
        if (updated.count) await tx.outboxMessage.create({ data: { eventType: 'ai.editorial.proposed.v1', aggregateId: job.id, payload: { jobId: job.id, elapsedMs: Date.now() - started, usage: result.usage, fits: !fit.overflow } } });
      });
    } catch (error) {
      const allowed = ['submission_uncertain', 'provider_unavailable', 'provider_timeout', 'provider_rate_limit', 'unsupported_language', 'wrong_language', 'language_unverified', 'empty_response', 'not_shorter', 'target_exceeded', 'REJECTED_PROPOSAL'];
      const code = error instanceof Error && allowed.includes(error.message) ? error.message : 'invalid_proposal';
      await this.prisma.$transaction(async tx => {
        const updated = await tx.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt }, data: { status: AiDesignJobStatus.FAILED, errorCode: code, completedAt: new Date() } });
        if (updated.count) await tx.outboxMessage.create({ data: { eventType: 'ai.editorial.failed.v1', aggregateId: job.id, payload: { jobId: job.id, errorCode: code, elapsedMs: Date.now() - started } } });
      });
    }
  }

  private async lockQuotaRows(tx: Prisma.TransactionClient, ownerSubject: string) {
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(73648201, 0)`);
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(73648201, hashtext(${ownerSubject}))`);
  }

  private rejectQuota(reason: ReturnType<typeof aiQuotaRejection>) {
    if (!reason) return;
    const message = reason === 'OWNER_ACTIVE'
      ? 'Limite de générations simultanées atteinte pour ce compte.'
      : reason === 'GLOBAL_ACTIVE'
        ? 'La file de génération est saturée. Réessayez plus tard.'
        : 'Limite horaire de générations atteinte pour ce compte.';
    throw new HttpException({ statusCode: 429, error: 'AI_QUOTA_EXCEEDED', message }, 429);
  }

  private async assertActiveCapacity(tx: Prisma.TransactionClient, ownerSubject: string) {
    await this.lockQuotaRows(tx, ownerSubject);
    const limits = aiJobLimits();
    const activeStatuses = [AiDesignJobStatus.QUEUED, AiDesignJobStatus.PROCESSING];
    const [activeOwner, activeGlobal] = await Promise.all([
      tx.aiDesignJob.count({ where: { ownerSubject, status: { in: activeStatuses } } }),
      tx.aiDesignJob.count({ where: { status: { in: activeStatuses } } }),
    ]);
    this.rejectQuota(aiActiveQuotaRejection({ activeOwner, activeGlobal }, limits));
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
    const publicJob = this.publicJob(job);
    if (String((job.sourceDocument as Record<string, unknown>)['workflow']).startsWith('EDITORIAL_')) {
      if (Date.now() - job.createdAt.getTime() > 3600000) return { ...publicJob, status: 'EXPIRED', editorial: null };
      const context = await this.designs.editorial(eventId, designId, authorization);
      const source = job.sourceDocument as Record<string, unknown>;
      if (context.sourceVersion !== job.baseVersion || !context.fields.some(field => field.elementId === source['elementId'] && field.sourceText === source['sourceText'] && editorialLayoutKey(field.layer) === editorialLayoutKey(source['layer'] as Record<string, unknown>))) return { ...publicJob, status: 'STALE', editorial: null };
    }
    return publicJob;
  }

  async cancel(eventId: string, designId: string, jobId: string, ownerSubject: string, authorization: string) {
    await this.designs.get(eventId, designId, authorization);
    if (!uuidPattern.test(jobId)) throw new NotFoundException('Proposition IA introuvable.');
    const job = await this.prisma.$transaction(async (tx) => {
      const current = await tx.aiDesignJob.findFirst({ where: { id: jobId, eventId, designId, ownerSubject } });
      if (!current) throw new NotFoundException('Proposition IA introuvable.');
      const editorial = String((current.sourceDocument as Record<string, unknown>)['workflow']).startsWith('EDITORIAL_');
      const cancellable: AiDesignJobStatus[] = editorial ? [AiDesignJobStatus.QUEUED, AiDesignJobStatus.PROCESSING, AiDesignJobStatus.PROPOSED] : [AiDesignJobStatus.QUEUED];
      if (!cancellable.includes(current.status)) throw new ConflictException('Cette demande ne peut plus être annulée.');
      const cancelled = await tx.aiDesignJob.updateMany({ where: { id: jobId, eventId, designId, ownerSubject, status: { in: cancellable } }, data: { status: AiDesignJobStatus.CANCELLED, completedAt: new Date() } });
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
      if (String((current.sourceDocument as Record<string, unknown>)['workflow']).startsWith('EDITORIAL_')) {
        const context = await this.designs.editorial(eventId, designId, authorization);
        const source = current.sourceDocument as Record<string, unknown>;
        if (Date.now() - current.createdAt.getTime() > 3600000 || context.sourceVersion !== current.baseVersion || !context.fields.some(field => field.elementId === source['elementId'] && field.sourceText === source['sourceText'])) throw new ConflictException('Proposition expirée ou obsolète.');
      }
      if (current.status !== AiDesignJobStatus.FAILED) throw new ConflictException('Seule une demande en échec peut être relancée.');
      if (current.attempt >= maxAttempts) throw new ConflictException('Cette demande a atteint sa limite de tentatives.');
      await this.assertActiveCapacity(tx, ownerSubject);
      const updated = await tx.aiDesignJob.updateMany({ where: { id: jobId, ownerSubject, status: AiDesignJobStatus.FAILED }, data: { status: AiDesignJobStatus.QUEUED, deliveryAfter: new Date(Date.now() + 30_000), startedAt: null, completedAt: null, errorCode: null, summary: null } });
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
    if (String((job.sourceDocument as Record<string, unknown>)['workflow']).startsWith('EDITORIAL_')) { await this.processEditorial(job, now); return; }
    let previewObjectKey: string | null = null;
    try {
      const providerMode = selectedProvider();
      const provider = providerMode === 'mock' ? new MockAIProvider() : providerMode === 'openai' ? new OpenAITextProvider() : new SelfHostedAIProvider();
      const input = { prompt: job.prompt, document: job.sourceDocument as JsonObject };
      const checkpoint = job.proposal as JsonObject | null;
      const reusable = checkpoint && typeof checkpoint['summary'] === 'string' && Array.isArray(checkpoint['changes']);
      if (providerMode === 'openai' && !reusable && checkpoint?.['textSubmissionStarted']) throw new Error('submission_uncertain');
      if (providerMode === 'openai' && !reusable) {
        const marked = await this.prisma.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt: now }, data: { proposal: { textSubmissionStarted: true } } });
        if (!marked.count) return;
      }
      const result = reusable ? { summary: checkpoint['summary'] as string, changes: checkpoint['changes'] as import('./providers.js').DesignChange[], ...(checkpoint['usage'] ? { usage: checkpoint['usage'] } : {}), visualPrompt: typeof checkpoint['visualPrompt'] === 'string' ? checkpoint['visualPrompt'] : '' } : await provider.edit(input);
      if (!reusable) {
        const saved = await this.prisma.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt: now }, data: { proposal: result as Prisma.InputJsonValue } });
        if (!saved.count) return;
      }
      const proposal = applyDesignChanges(input.document, result.summary, result.changes);
      const previewPrompt = `Invitation background art direction. ${'visualPrompt' in result && result.visualPrompt ? result.visualPrompt : job.prompt}. Palette: ${((proposal.document['theme'] as JsonObject)['tokens'] as JsonObject)['primary']}, ${((proposal.document['theme'] as JsonObject)['tokens'] as JsonObject)['secondary']}, ${((proposal.document['theme'] as JsonObject)['tokens'] as JsonObject)['background']}. Preserve generous negative space for invitation text.`;
      if (providerMode === 'openai' && job.prompt.startsWith('VISUAL_VARIATION\n') && process.env['AI_IMAGE_PROVIDER'] === 'flux') {
        const flux = new FluxImageProvider();
        let task = checkpoint?.['fluxTask'] as FluxTask | undefined;
        if (!task) {
          if (checkpoint?.['fluxSubmissionStarted']) throw new Error('submission_uncertain');
          const sending = await this.prisma.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt: now }, data: { proposal: { ...result, fluxSubmissionStarted: true } as Prisma.InputJsonValue } });
          if (!sending.count) return;
          task = await flux.submit(previewPrompt);
          const tracking = await this.prisma.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt: now }, data: { proposal: { ...result, fluxSubmissionStarted: true, fluxTask: task } as Prisma.InputJsonValue } });
          if (!tracking.count) return;
        }
        previewObjectKey = await this.previews.put(job.eventId, job.designId, job.id, await flux.result(task));
      }
      previewObjectKey = providerMode === 'self-hosted' ? await this.previews.put(job.eventId, job.designId, job.id, await this.images.generate({ prompt: previewPrompt })) : previewObjectKey;
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.aiDesignJob.updateMany({ where: { id: job.id, status: AiDesignJobStatus.PROCESSING, startedAt: now }, data: {
          status: AiDesignJobStatus.PROPOSED, provider: providerMode, summary: proposal.summary,
          proposal: { document: proposal.document, changes: proposal.changes, textModel: providerMode === 'openai' ? process.env['OPENAI_TEXT_MODEL'] || 'gpt-5.4' : null, operation: 'STYLE_PROPOSAL', ...('usage' in result ? { usage: result.usage } : {}), ...(previewObjectKey ? { imageRequests: 1, imageProvider: providerMode === 'openai' ? 'flux' : 'comfyui', imageModel: providerMode === 'openai' ? process.env['FLUX_MODEL'] || 'flux-2-klein-9b' : process.env['COMFYUI_MODEL'] || 'configured' } : {}) } as Prisma.InputJsonValue,
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
      summary: job.summary, proposal: proposal && job.status === AiDesignJobStatus.PROPOSED ? { document: proposal['document'] ?? null, changes: proposal['changes'] ?? [] } : null,
      editorial: String(proposal?.['workflow']).startsWith('EDITORIAL_') ? proposal : null,
      provider: job.provider, status: job.status, attempt: job.attempt, errorCode: job.errorCode,
      createdAt: job.createdAt, updatedAt: job.updatedAt, startedAt: job.startedAt, completedAt: job.completedAt, previewAvailable: Boolean(job.previewObjectKey),
    };
  }
}
