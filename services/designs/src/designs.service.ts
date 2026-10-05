import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DesignStatus, Prisma, TemplateCategory, type Design } from '../generated/prisma/client.js';
import { assertProfessionalPersonalization, editorialField, editorialTarget, protectedEditorialTerms, applyEditorialSelection, resolveDesignLayout, composeDesignProposals, professionalCompositionManifest, validateDesignDocumentV2, type ComposerEventType } from '@invitaflow/design-document';
import { EventsClient } from './events-client.js';
import { PrismaService } from './prisma.service.js';
import { normalizeDesignDocument, templateVariables, validateDesignDocument } from './design-document.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories = new Set<string>(Object.values(TemplateCategory));
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}` : JSON.stringify(value);

function text(value: unknown, name: string, maximum: number) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maximum ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new BadRequestException(`${name} est invalide.`);
  return value.trim();
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException(`${name} est invalide.`);
  return value as Record<string, unknown>;
}

function channel(hex: string, offset: number) {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(first: string, second: string) {
  const luminance = (value: string) =>
    0.2126 * channel(value, 1) + 0.7152 * channel(value, 3) + 0.0722 * channel(value, 5);
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

@Injectable()
export class DesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsClient,
  ) {}

  private async composerPhotos(authorization: string) {
    const base = (process.env['MEDIA_SERVICE_URL'] ?? 'http://media:3014').replace(/\/$/, '');
    const items: { id: string; width: number; height: number; purpose: string; status: string }[] = [];
    let cursor: string | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < 20; page++) {
      const query = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) });
      let response: Response;
      try { response = await fetch(`${base}/v1/assets?${query}`, { headers: { authorization }, cache: 'no-store', signal: AbortSignal.timeout(5_000) }); }
      catch { throw new ServiceUnavailableException('L’inventaire des médias privés est indisponible. Réessayez plus tard.'); }
      if (!response.ok) throw new ServiceUnavailableException('L’inventaire des médias privés est indisponible. Réessayez plus tard.');
      const result = await response.json() as { items?: { id?: unknown; purpose?: unknown; status?: unknown; width?: unknown; height?: unknown }[]; nextCursor?: unknown };
      if (!Array.isArray(result.items)) throw new ServiceUnavailableException('La réponse du service Media est invalide.');
      for (const item of result.items) if (item.purpose === 'PHOTO' && item.status === 'READY' && typeof item.id === 'string' && uuidPattern.test(item.id) && Number.isInteger(item.width) && Number.isInteger(item.height) && Number(item.width) > 0 && Number(item.height) > 0) items.push({ id: item.id, width: Number(item.width), height: Number(item.height), purpose: 'PHOTO', status: 'READY' });
      if (result.nextCursor === null || result.nextCursor === undefined) return items;
      if (typeof result.nextCursor !== 'string' || seen.has(result.nextCursor)) throw new ServiceUnavailableException('La pagination des médias est invalide.');
      cursor = result.nextCursor;
      seen.add(cursor);
    }
    if (cursor) throw new ServiceUnavailableException('L’inventaire dépasse la limite de composition. Réduisez le nombre de médias et réessayez.');
    return items;
  }

  private composerEventInput(event: Awaited<ReturnType<EventsClient['assertOwnerEvent']>>, photos: Awaited<ReturnType<DesignsService['composerPhotos']>>, seed: string, preferences: Record<string, unknown>, previouslyShown: string[] = []) {
    const ceremonies = (event.ceremonies ?? []).map(ceremony => ({
      name: typeof ceremony['name'] === 'string' ? ceremony['name'] : '',
      date: typeof ceremony['date'] === 'string' ? ceremony['date'] : typeof ceremony['startAt'] === 'string' ? ceremony['startAt'] : '',
      time: typeof ceremony['time'] === 'string' ? ceremony['time'] : typeof ceremony['startAt'] === 'string' ? ceremony['startAt'].slice(11, 16) : '',
      venue: typeof ceremony['venue'] === 'string' ? ceremony['venue'] : typeof ceremony['location'] === 'string' ? ceremony['location'] : '',
      address: typeof ceremony['address'] === 'string' ? ceremony['address'] : '',
      reference: typeof ceremony['reference'] === 'string' ? ceremony['reference'] : '',
      dressCode: typeof ceremony['dressCode'] === 'string' ? ceremony['dressCode'] : '',
    }));
    const words = [event.name, event.invitationText, ...ceremonies.flatMap(ceremony => Object.values(ceremony))].filter(Boolean).join(' ').length;
    const rawType = event.eventType === 'OTHER' ? 'CUSTOM' : event.eventType ?? 'CUSTOM';
    const knownTypes: ComposerEventType[] = ['WEDDING', 'DOT', 'BIRTHDAY', 'ANNIVERSARY', 'GRADUATION', 'CORPORATE', 'RELIGIOUS', 'FUNERAL_OR_MEMORIAL', 'BABY_SHOWER', 'CONFERENCE', 'GALA', 'CUSTOM', 'BAPTISM', 'DINNER', 'CEREMONY', 'OTHER'];
    return {
      eventType: (knownTypes.includes(rawType as ComposerEventType) ? rawType : 'CUSTOM') as ComposerEventType,
      eventTitle: event.name ?? '', coupleNames: event.coupleNames ?? '', invitationText: event.invitationText ?? '', eventDate: event.startAt ?? '', venue: event.venue ?? '',
      ceremonyTypes: [...new Set((event.ceremonies ?? []).map(item => typeof item.ceremonyType === 'string' ? item.ceremonyType.toUpperCase() : 'CUSTOM'))], ceremonies,
      textDensity: (words <= 300 ? 'LOW' : words <= 800 ? 'MEDIUM' : 'HIGH') as 'LOW' | 'MEDIUM' | 'HIGH',
      hasTable: false, hasQr: true, hasDressCode: ceremonies.some(ceremony => !!ceremony.dressCode), photos, seed, preferences: preferences as { style?: string; mood?: string; colors?: string[]; description?: string; media?: 'ANY' | 'WITH_PHOTO' | 'WITHOUT_PHOTO'; count?: number; photoIds?: string[] }, previouslyShown,
    };
  }

  async composerProposals(eventId: string, ownerSubject: string, authorization: string, rawInput: unknown) {
    const input = object(rawInput, 'Les préférences du Composer');
    if (Object.keys(input).some(key => !['seed', 'preferences', 'previouslyShown'].includes(key)) || typeof input['seed'] !== 'string' || !input['seed'].trim() || input['seed'].length > 128) throw new BadRequestException('La seed ou les préférences du Composer sont invalides.');
    const preferences = input['preferences'] === undefined ? {} : object(input['preferences'], 'Les préférences');
    if (Object.keys(preferences).some(key => !['style', 'mood', 'colors', 'description', 'media', 'count', 'photoIds'].includes(key)) || preferences['photoIds'] !== undefined && (!Array.isArray(preferences['photoIds']) || preferences['photoIds'].length > 200 || preferences['photoIds'].some(value => typeof value !== 'string' || !uuidPattern.test(value)))) throw new BadRequestException('Préférence de composition non prise en charge.');
    if (input['previouslyShown'] !== undefined && (!Array.isArray(input['previouslyShown']) || input['previouslyShown'].length > 200 || input['previouslyShown'].some(value => typeof value !== 'string' || value.length > 512))) throw new BadRequestException('Historique de propositions invalide.');
    const event = await this.event(eventId, authorization);
    const photos = await this.composerPhotos(authorization);
    const priorDesigns = await this.prisma.design.findMany({ where: { eventId, ownerSubject, status: DesignStatus.DRAFT }, select: { document: true }, take: 200 });
    const eventHistory = priorDesigns.flatMap(item => {
      const document = item.document as Record<string, unknown>;
      const metadata = document['metadata'] as Record<string, unknown> | undefined;
      const composer = metadata?.['composer'] as Record<string, unknown> | undefined;
      return typeof composer?.['fingerprint'] === 'string' ? [composer['fingerprint']] : [];
    });
    const previouslyShown = [...new Set([...(input['previouslyShown'] as string[] | undefined ?? []), ...eventHistory])].slice(-200);
    try { return composeDesignProposals(this.composerEventInput(event, photos, input['seed'], preferences, previouslyShown)); }
    catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Les propositions ne peuvent pas être composées.'); }
  }

  async selectComposed(eventId: string, ownerSubject: string, authorization: string, rawInput: unknown) {
    const input = object(rawInput, 'La proposition choisie');
    if (Object.keys(input).some(key => !['document', 'name'].includes(key))) throw new BadRequestException('La proposition choisie contient des champs inconnus.');
    const document = validateDesignDocumentV2(input['document']);
    const composer = document['metadata']?.['composer'] as Record<string, unknown> | undefined;
    if (!composer || composer['composerVersion'] !== 'AI_COMPOSER_V1' || typeof composer['seed'] !== 'string' || typeof composer['fingerprint'] !== 'string' || !Array.isArray(composer['previouslyShown']) || !composer['interpretedPreferences'] || typeof composer['interpretedPreferences'] !== 'object') throw new BadRequestException('La proposition de composition n’est pas reconnue. Générez-la à nouveau.');
    const name = text(input['name'], 'Le nom du design', 120);
    const event = await this.event(eventId, authorization);
    const photos = await this.composerPhotos(authorization);
    let reproduced;
    try { reproduced = composeDesignProposals(this.composerEventInput(event, photos, composer['seed'] as string, composer['interpretedPreferences'] as Record<string, unknown>, composer['previouslyShown'] as string[])); }
    catch { throw new BadRequestException('Les données de l’événement ou de ses médias ont changé. Générez une nouvelle composition.'); }
    const proposal = reproduced.items.find(item => item.fingerprint === composer['fingerprint']);
    if (!proposal || canonical(proposal.document) !== canonical(document)) throw new BadRequestException('Cette composition est périmée ou a été modifiée. Générez une nouvelle proposition.');
    const manifest = professionalCompositionManifest(document, composer['seed'] as string);
    if (manifest.fingerprint !== composer['fingerprint']) throw new BadRequestException('L’empreinte de composition est invalide.');
    const created = await this.prisma.$transaction(async tx => {
      const design = await tx.design.create({ data: { ownerSubject, eventId, templateId: null, templateSlug: proposal.recipeId, name, version: 1, document: document as Prisma.InputJsonValue } });
      await tx.designVersion.create({ data: { designId: design.id, version: 1, name, document: document as Prisma.InputJsonValue } });
      await tx.outboxMessage.create({ data: { eventType: 'design.created.v1', aggregateId: design.id, payload: { eventId, ownerSubject, designId: design.id, version: 1, origin: 'AI_COMPOSER_V1', recipeId: proposal.recipeId, seed: composer['seed'] as string, fingerprint: composer['fingerprint'] as string } } });
      return { ...design, document };
    });
    return created;
  }

  private async acceptManualEditorial(eventId: string, ownerSubject: string, authorization: string, designId: string, input: Record<string, unknown>): Promise<Design> {
    if (Object.keys(input).some(key => !['editorialText', 'elementId', 'sourceText', 'expectedVersion'].includes(key))) throw new BadRequestException('Modification éditoriale invalide.');
    const context = await this.editorialContext(eventId, ownerSubject, authorization, designId);
    const field = context.fields.find(entry => entry?.elementId === input['elementId']);
    if (!field || input['expectedVersion'] !== context.sourceVersion || input['sourceText'] !== field.sourceText) throw new BadRequestException('Texte ou design modifié. Rechargez-le.');
    const selectedText = input['editorialText'];
    if (typeof selectedText !== 'string' || !selectedText.trim() || selectedText.length > 12000 || editorialTarget(field.layer, selectedText).overflow) throw new BadRequestException('Texte invalide ou trop long pour cette composition.');
    const design = await this.get(eventId, ownerSubject, authorization, designId);
    return this.update(eventId, ownerSubject, authorization, designId, { name: design.name, document: design.document, expectedVersion: context.sourceVersion }, { elementId: field.elementId, selectedText, provenance: { sourceText: field.sourceText, sourceVersion: context.sourceVersion, origin: 'MANUAL' } });
  }

  private async acceptEditorial(eventId: string, ownerSubject: string, authorization: string, designId: string, input: Record<string, unknown>): Promise<Design> {
    if (Object.keys(input).some(key => !['editorialJobId', 'expectedVersion'].includes(key)) || typeof input['editorialJobId'] !== 'string' || !uuidPattern.test(input['editorialJobId'])) throw new BadRequestException('Proposition invalide.');
    const context = await this.editorialContext(eventId, ownerSubject, authorization, designId);
    const response = await fetch((process.env['AI_DESIGN_SERVICE_URL'] ?? 'http://ai-design:3008').replace(/\/$/, '') + '/v1/events/' + eventId + '/designs/' + designId + '/ai-jobs/' + input['editorialJobId'], { headers: { authorization }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new BadRequestException('Proposition indisponible.');
    const job = await response.json() as { id: string; status: string; baseVersion: number; editorial?: { elementId: string; sourceText: string; proposedText: string; fits: boolean } };
    const proposal = job.editorial;
    const field = context.fields.find(entry => entry?.elementId === proposal?.elementId);
    if (job.id !== input['editorialJobId'] || job.status !== 'PROPOSED' || job.baseVersion !== context.sourceVersion || input['expectedVersion'] !== context.sourceVersion || !proposal || !field || proposal.sourceText !== field.sourceText || !proposal.fits || !proposal.proposedText) throw new BadRequestException('Proposition obsolète ou non valide. Demandez une nouvelle proposition.');
    if (field.protectedTerms.some(term => !proposal.proposedText.includes(term))) throw new BadRequestException('Information protégée absente.');
    const fit = editorialTarget(field.layer, proposal.proposedText);
    if (fit.overflow) throw new BadRequestException('Le texte dépasse encore la composition.');
    const design = await this.get(eventId, ownerSubject, authorization, designId);
    return this.update(eventId, ownerSubject, authorization, designId, { name: design.name, document: design.document, expectedVersion: context.sourceVersion }, { elementId: proposal.elementId, selectedText: proposal.proposedText, provenance: { sourceText: proposal.sourceText, sourceVersion: context.sourceVersion, jobId: job.id, origin: 'AI_ASSISTED' } });
  }

  async editorialContext(eventId: string, ownerSubject: string, authorization: string, designId: string) {
    const design = await this.get(eventId, ownerSubject, authorization, designId);
    const event = await this.event(eventId, authorization);
    const document = normalizeDesignDocument(design.document);
    const snapshot = { event: { title: event.name ?? '', invitationText: event.invitationText ?? '', coupleNames: event.coupleNames ?? '', date: event.startAt ?? '', venue: event.venue ?? '' }, ceremonies: (event.ceremonies ?? []).map(ceremony => Object.fromEntries(['name', 'date', 'time', 'venue', 'address', 'reference', 'dressCode'].map(key => [key, typeof ceremony[key] === 'string' ? ceremony[key] : '']))) };
    const layout = resolveDesignLayout(document, snapshot, undefined, undefined, { mode: 'web' });
    const declarations = ((document['metadata'] as Record<string, unknown>)?.['editorialFields'] ?? []) as { elementId: string }[];
    return { sourceVersion: design.version, fields: declarations.map(({ elementId }) => {
      editorialField(document, elementId);
      const layer = layout.elements.find(entry => entry['id'] === elementId);
      if (!layer) return null;
      const sourceText = String(layer['resolvedText'] ?? '');
      const structured = [event.coupleNames, ...(event.coupleNames?.split(/\s+(?:&|et|and)\s+/i) ?? []), event.venue, event.startAt, ...(event.ceremonies ?? []).flatMap(ceremony => ['name', 'date', 'time', 'venue', 'address', 'reference', 'dressCode'].map(key => ceremony[key]))].filter((term): term is string => typeof term === 'string' && !!term && sourceText.includes(term));
      const fragments = [...new Set(structured)];
      if (fragments.length > 50) throw new BadRequestException('Trop de fragments structurés dans le texte : utilisez une correction manuelle.');
      return { elementId, sourceText, protectedTerms: protectedEditorialTerms(sourceText, fragments), target: editorialTarget(layer, sourceText), layer };
    }).filter(Boolean) };
  }

  async checkStorageReference(assetId: string, objectKey: string) {
    const asset = Prisma.sql`SELECT EXISTS (
      SELECT 1 FROM designs WHERE document @> ${JSON.stringify({ elements: [{ assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ elements: [{ originalAssetId: assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ elements: [{ derivedAssetId: assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ assets: [{ assetId }] })}::jsonb
      UNION ALL SELECT 1 FROM design_versions WHERE document @> ${JSON.stringify({ elements: [{ assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ elements: [{ originalAssetId: assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ elements: [{ derivedAssetId: assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ assets: [{ assetId }] })}::jsonb
      UNION ALL SELECT 1 FROM design_templates WHERE document @> ${JSON.stringify({ elements: [{ assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ elements: [{ originalAssetId: assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ elements: [{ derivedAssetId: assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ assets: [{ assetId }] })}::jsonb
      UNION ALL SELECT 1 FROM design_template_versions WHERE document @> ${JSON.stringify({ elements: [{ assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ elements: [{ originalAssetId: assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ elements: [{ derivedAssetId: assetId }] })}::jsonb
        OR document @> ${JSON.stringify({ assets: [{ assetId }] })}::jsonb
    ) AS referenced`;
    const rows = await this.prisma.$queryRaw<Array<{ referenced: boolean }>>(asset);
    if (rows[0]?.referenced) return { status: 'REFERENCED' as const };
    const keyRows = await this.prisma.$queryRaw<Array<{ referenced: boolean }>>(Prisma.sql`SELECT EXISTS (
      SELECT 1 FROM designs WHERE document::text LIKE ${`%${objectKey}%`}
      UNION ALL SELECT 1 FROM design_versions WHERE document::text LIKE ${`%${objectKey}%`}
      UNION ALL SELECT 1 FROM design_templates WHERE document::text LIKE ${`%${objectKey}%`}
      UNION ALL SELECT 1 FROM design_template_versions WHERE document::text LIKE ${`%${objectKey}%`}
    ) AS referenced`);
    return { status: keyRows[0]?.referenced ? 'REFERENCED' as const : 'UNREFERENCED' as const };
  }

  async checkPublishedTemplateAsset(assetId: string) {
    // Published decoration only; event/client photos never receive this grant.
    const rows = await this.prisma.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`SELECT EXISTS (
      SELECT 1 FROM design_template_versions
      WHERE document @> ${JSON.stringify({ metadata: { sharedAssetIds: [assetId] }, elements: [{ type: 'IMAGE', role: 'DECORATION', assetId }] })}::jsonb
    ) AS allowed`);
    return { allowed: rows[0]?.allowed === true };
  }

  private async event(eventId: string, authorization: string) {
    if (!uuidPattern.test(eventId)) throw new NotFoundException('Événement introuvable.');
    return this.events.assertOwnerEvent(eventId, authorization);
  }

  private templateMatchesEvent(templateTypes: string[], eventTypes: string[]) {
    return templateTypes.includes('UNIVERSAL') || templateTypes.some((type) => eventTypes.includes(type));
  }

  async listTemplates(eventId: string, authorization: string, rawCategory?: string) {
    const event = await this.event(eventId, authorization);
    if (rawCategory && !categories.has(rawCategory))
      throw new BadRequestException('Catégorie de template invalide.');
    const ceremonyTypes = [...new Set((event.ceremonies ?? [])
      .map((ceremony) => typeof ceremony.ceremonyType === 'string' ? ceremony.ceremonyType.toUpperCase() : '')
      .map((type) => type === 'OTHER' ? 'CUSTOM' : type)
      .filter((type) => ['CIVIL', 'RELIGIOUS', 'RECEPTION', 'DOT', 'TRADITIONAL', 'CUSTOM'].includes(type)))];
    const items = await this.prisma.designTemplate.findMany({
      where: {
        isActive: true,
        ...(rawCategory ? { category: rawCategory as TemplateCategory } : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        version: true,
        name: true,
        description: true,
        category: true,
        style: true,
        tags: true,
        preview: true,
        versions: { select: { version: true, ceremonyTypes: true } },
      },
    });
    return { items: items.flatMap(({ versions, ...template }) => {
      const current = versions.find((version) => version.version === template.version);
      if (!current || (!current.ceremonyTypes.includes('UNIVERSAL') && !current.ceremonyTypes.some((type) => ceremonyTypes.includes(type)))) return [];
      return [{ ...template, ceremonyTypes: current.ceremonyTypes }];
    }) };
  }

  async getTemplate(eventId: string, authorization: string, templateId: string) {
    const event = await this.event(eventId, authorization);
    if (!uuidPattern.test(templateId)) throw new NotFoundException('Template introuvable.');
    const template = await this.prisma.designTemplate.findFirst({
      where: { id: templateId, isActive: true },
      select: {
        id: true,
        slug: true,
        version: true,
        name: true,
        description: true,
        category: true,
        style: true,
        tags: true,
        preview: true,
        document: true,
        versions: { select: { version: true, ceremonyTypes: true, document: true } },
      },
    });
    if (!template) throw new NotFoundException('Template introuvable.');
    const version = template.versions.find((item) => item.version === template.version);
    if (!version) throw new NotFoundException('Version du template introuvable.');
    const eventTypes = (event.ceremonies ?? []).map((item) => typeof item.ceremonyType === 'string' ? item.ceremonyType.toUpperCase() : '').map((type) => type === 'OTHER' ? 'CUSTOM' : type);
    if (!this.templateMatchesEvent(version.ceremonyTypes, eventTypes)) throw new NotFoundException('Template indisponible pour les cérémonies de cet événement.');
    const { versions: _versions, ...metadata } = template;
    void _versions;
    return { ...metadata, ceremonyTypes: version.ceremonyTypes, document: version.document };
  }

  async list(
    eventId: string,
    ownerSubject: string,
    authorization: string,
    includeArchived = false,
  ) {
    await this.event(eventId, authorization);
    const items = await this.prisma.design.findMany({
      where: { eventId, ownerSubject, ...(includeArchived ? {} : { status: DesignStatus.DRAFT }) },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        eventId: true,
        templateId: true,
        templateSlug: true,
        name: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { items };
  }

  async get(
    eventId: string,
    ownerSubject: string,
    authorization: string,
    designId: string,
    includeArchived = false,
  ) {
    await this.event(eventId, authorization);
    if (!uuidPattern.test(designId)) throw new NotFoundException('Design introuvable.');
    const design = await this.prisma.design.findFirst({
      where: {
        id: designId,
        eventId,
        ownerSubject,
        ...(includeArchived ? {} : { status: DesignStatus.DRAFT }),
      },
      select: {
        id: true,
        eventId: true,
        templateId: true,
        templateSlug: true,
        name: true,
        status: true,
        version: true,
        document: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!design) throw new NotFoundException('Design introuvable.');
    return { ...design, document: normalizeDesignDocument(design.document) };
  }

  async create(eventId: string, ownerSubject: string, authorization: string, body: unknown) {
    const event = await this.event(eventId, authorization);
    const input = object(body, 'Le design');
    if (Object.keys(input).some((key) => !['templateId', 'name'].includes(key)))
      throw new BadRequestException('Champs non pris en charge.');
    const name = text(input['name'], 'Le nom du design', 120);
    const templateId = input['templateId'];
    if (typeof templateId !== 'string' || !uuidPattern.test(templateId))
      throw new BadRequestException('Choisissez un template enregistré.');
    const template = await this.prisma.designTemplate.findFirst({
      where: { id: templateId, isActive: true },
      include: { versions: { select: { version: true, ceremonyTypes: true, document: true } } },
    });
    if (!template) throw new NotFoundException('Template introuvable.');
    const templateVersion = template.versions.find((item) => item.version === template.version);
    if (!templateVersion) throw new NotFoundException('Version du template introuvable.');
    const eventTypes = (event.ceremonies ?? []).map((item) => typeof item.ceremonyType === 'string' ? item.ceremonyType.toUpperCase() : '').map((type) => type === 'OTHER' ? 'CUSTOM' : type);
    if (!this.templateMatchesEvent(templateVersion.ceremonyTypes, eventTypes)) throw new NotFoundException('Template indisponible pour les cérémonies de cet événement.');
    const document = validateDesignDocument(normalizeDesignDocument(templateVersion.document));
    const version = await this.prisma.$transaction(async (tx) => {
      const design = await tx.design.create({
        data: {
          ownerSubject,
          eventId,
          templateId: template.id,
          templateSlug: template.slug,
          name,
          version: 1,
          document: document as Prisma.InputJsonValue,
        },
      });
      await tx.designVersion.create({
        data: {
          designId: design.id,
          version: 1,
          name,
          document: document as Prisma.InputJsonValue,
        },
      });
      await tx.outboxMessage.create({
        data: {
          eventType: 'design.created.v1',
          aggregateId: design.id,
          payload: { eventId, ownerSubject, designId: design.id, version: 1 },
        },
      });
    return { ...design, document: normalizeDesignDocument(design.document) };
    });
    return version;
  }

  async update(
    eventId: string,
    ownerSubject: string,
    authorization: string,
    designId: string,
    body: unknown,
    editorialApproval?: { elementId: string; selectedText: string; provenance: Record<string, unknown> },
    trustedRestore = false,
  ): Promise<Design> {
    await this.event(eventId, authorization);
    if (!uuidPattern.test(designId)) throw new NotFoundException('Design introuvable.');
    const input = object(body, 'Le design');
    if (input['editorialText'] !== undefined) return this.acceptManualEditorial(eventId, ownerSubject, authorization, designId, input);
    if (input['editorialJobId'] !== undefined) return this.acceptEditorial(eventId, ownerSubject, authorization, designId, input);
    if (Object.keys(input).some((key) => !['name', 'document', 'expectedVersion'].includes(key)))
      throw new BadRequestException('Champs non pris en charge.');
    if (!Number.isInteger(input['expectedVersion']) || (input['expectedVersion'] as number) < 1)
      throw new BadRequestException('Rechargez le design avant de le modifier.');
    const name = text(input['name'], 'Le nom du design', 120);
    const document = validateDesignDocument(normalizeDesignDocument(input['document']));
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.design.findFirst({
        where: { id: designId, eventId, ownerSubject, status: DesignStatus.DRAFT },
      });
      if (!existing) throw new NotFoundException('Design introuvable.');
      if (existing.version !== input['expectedVersion'])
        throw new BadRequestException(
          'Ce design a été modifié ailleurs. Rechargez-le avant d’enregistrer.',
        );
      const nextVersion = existing.version + 1;
      try { if (!editorialApproval && !trustedRestore) assertProfessionalPersonalization(existing.document, document); }
      catch { throw new BadRequestException('La structure de ce template est verrouillée. Personnalisez uniquement les photos, couleurs et polices autorisées.'); }
      const approvedDocument = editorialApproval ? applyEditorialSelection(existing.document, editorialApproval.elementId, editorialApproval.selectedText, editorialApproval.provenance) : document;
      const nextDocument = { ...validateDesignDocument(approvedDocument), version: nextVersion };
      const updated = await tx.design.updateMany({
        where: {
          id: designId,
          eventId,
          ownerSubject,
          status: DesignStatus.DRAFT,
          version: existing.version,
        },
        data: { name, version: nextVersion, document: nextDocument as Prisma.InputJsonValue },
      });
      if (updated.count !== 1)
        throw new BadRequestException(
          'Ce design a été modifié ailleurs. Rechargez-le avant d’enregistrer.',
        );
      await tx.designVersion.create({
        data: {
          designId,
          version: nextVersion,
          name,
          document: nextDocument as Prisma.InputJsonValue,
        },
      });
      await tx.outboxMessage.create({
        data: {
          eventType: 'design.updated.v1',
          aggregateId: designId,
          payload: { eventId, ownerSubject, designId, version: nextVersion },
        },
      });
      if (editorialApproval) await tx.outboxMessage.create({ data: { eventType: 'design.editorial.selected.v1', aggregateId: designId, payload: { eventId, ownerSubject, designId, sourceVersion: existing.version, version: nextVersion, origin: editorialApproval.provenance['origin'] as string } } });
      return tx.design.findFirstOrThrow({ where: { id: designId, eventId, ownerSubject } });
    });
    return result;
  }

  async listVersions(
    eventId: string,
    ownerSubject: string,
    authorization: string,
    designId: string,
    includeArchived = false,
  ) {
    await this.get(eventId, ownerSubject, authorization, designId, includeArchived);
    const items = await this.prisma.designVersion.findMany({
      where: { designId },
      orderBy: { version: 'desc' },
      select: { version: true, name: true, document: true, createdAt: true },
    });
    return { items: items.map((item) => ({ ...item, document: normalizeDesignDocument(item.document) })) };
  }

  async restore(
    eventId: string,
    ownerSubject: string,
    authorization: string,
    designId: string,
    body: unknown,
  ) {
    const input = object(body, 'La version');
    if (
      Object.keys(input).some((key) => key !== 'version') ||
      !Number.isInteger(input['version']) ||
      (input['version'] as number) < 1
    )
      throw new BadRequestException('La version à restaurer est invalide.');
    await this.event(eventId, authorization);
    const restored = await this.prisma.designVersion.findFirst({
      where: {
        designId,
        version: input['version'] as number,
        design: { eventId, ownerSubject, status: DesignStatus.DRAFT },
      },
    });
    if (!restored) throw new NotFoundException('Version introuvable.');
    const current = await this.get(eventId, ownerSubject, authorization, designId);
    return this.update(eventId, ownerSubject, authorization, designId, {
      name: restored.name,
      document: restored.document,
      expectedVersion: current.version,
    }, undefined, true);
  }

  async archive(eventId: string, ownerSubject: string, authorization: string, designId: string) {
    await this.event(eventId, authorization);
    if (!uuidPattern.test(designId)) throw new NotFoundException('Design introuvable.');
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.design.updateMany({
        where: { id: designId, eventId, ownerSubject, status: DesignStatus.DRAFT },
        data: { status: DesignStatus.ARCHIVED },
      });
      if (updated.count !== 1) throw new NotFoundException('Design introuvable.');
      await tx.outboxMessage.create({
        data: {
          eventType: 'design.archived.v1',
          aggregateId: designId,
          payload: { eventId, ownerSubject, designId },
        },
      });
      return { id: designId, status: DesignStatus.ARCHIVED };
    });
    return result;
  }

  async inspectDocument(documentValue: unknown) {
    const document = validateDesignDocument(normalizeDesignDocument(documentValue));
    const elements = document['elements'] as Record<string, unknown>[];
    const rawMargin = (document['constraints'] as Record<string, unknown>)['safeMargin'];
    const safeMargin: { top: number; right: number; bottom: number; left: number } = typeof rawMargin === 'number' ? { top: rawMargin, right: rawMargin, bottom: rawMargin, left: rawMargin } : { top: Number((rawMargin as Record<string, unknown>)['top'] ?? 64), right: Number((rawMargin as Record<string, unknown>)['right'] ?? 64), bottom: Number((rawMargin as Record<string, unknown>)['bottom'] ?? 64), left: Number((rawMargin as Record<string, unknown>)['left'] ?? 64) };
    const canvas = document['canvas'] as Record<string, unknown>;
    const background = (document['theme']['tokens'] as Record<string, unknown>)[
      'background'
    ] as string;
    const problems: { code: string; layerId?: string; message: string }[] = [];
    const warnings: { code: string; layerId?: string; message: string }[] = [];
    for (const element of elements) {
      if (['TEXT', 'QR'].includes(String(element['type'])) && element['editable'] && !element['locked'] && (element['x'] as number) < safeMargin.left)
        problems.push({
          code: 'SAFE_MARGIN',
          layerId: element['id'] as string,
          message: `${element['name']} est trop près du bord gauche.`,
        });
      if (
        ['TEXT', 'QR'].includes(String(element['type'])) && element['editable'] &&
        !element['locked'] &&
        (element['x'] as number) + (element['width'] as number) >
          (canvas['width'] as number) - safeMargin.right
      )
        problems.push({
          code: 'SAFE_MARGIN',
          layerId: element['id'] as string,
          message: `${element['name']} est trop près du bord droit.`,
        });
      if (['TEXT', 'QR'].includes(String(element['type'])) && element['editable'] && !element['locked'] && (element['y'] as number) < safeMargin.top)
        problems.push({
          code: 'SAFE_MARGIN',
          layerId: element['id'] as string,
          message: `${element['name']} est trop près du bord supérieur.`,
        });
      if (
        ['TEXT', 'QR'].includes(String(element['type'])) && element['editable'] &&
        !element['locked'] &&
        (element['y'] as number) + (element['height'] as number) >
          (canvas['height'] as number) - safeMargin.bottom
      )
        problems.push({
          code: 'SAFE_MARGIN',
          layerId: element['id'] as string,
          message: `${element['name']} est trop près du bord inférieur.`,
        });
      if (element['type'] === 'TEXT') {
        const fontSize = element['fontSize'] as number;
        const rendered = (element['text'] as string).replace(
          /\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g,
          (_match, key: string) =>
            String(
              (document['variables'] as Record<string, unknown>[]).find(
                (variable) => variable['key'] === key,
              )?.['defaultValue'] ?? '',
            ),
        );
        const charsPerLine = Math.max(
          1,
          Math.floor((element['width'] as number) / (fontSize * 0.58)),
        );
        let estimatedLines = rendered.split('\n').reduce((total, paragraph) => {
          let rows = 1;
          let row = '';
          for (const word of paragraph.split(/\s+/)) {
            if (row && `${row} ${word}`.length > charsPerLine) {
              rows += 1;
              row = word;
            } else row = row ? `${row} ${word}` : word;
            if (row.length > charsPerLine) {
              rows += Math.ceil((row.length - charsPerLine) / charsPerLine);
              row = row.slice(-charsPerLine);
            }
          }
          return total + rows;
        }, 0);
        let fittedFontSize = fontSize;
        let availableLines = Math.max(1, Math.floor((element['height'] as number) / (fittedFontSize * Number(element['lineHeight'] ?? 1.2))));
        while (estimatedLines > availableLines && fittedFontSize > Number(element['minFontSize'] ?? fontSize)) {
          fittedFontSize -= 1;
          const fittedCharsPerLine = Math.max(1, Math.floor((element['width'] as number) / (fittedFontSize * 0.58)));
          estimatedLines = Math.max(1, Math.ceil([...rendered].length / fittedCharsPerLine));
          availableLines = Math.max(1, Math.floor((element['height'] as number) / (fittedFontSize * Number(element['lineHeight'] ?? 1.2))));
        }
        if (fittedFontSize < fontSize) warnings.push({ code: 'FONT_REDUCED', layerId: element['id'] as string, message: `${element['name']} sera réduit à ${fittedFontSize} px pour tenir dans sa zone.` });
        if (estimatedLines > availableLines)
          problems.push({
            code: 'TEXT_FIT',
            layerId: element['id'] as string,
            message: `${element['name']} risque de dépasser son cadre avec ce texte.`,
          });
        if (!['Georgia', 'Arial', 'Times New Roman'].includes(element['fontFamily'] as string))
          problems.push({
            code: 'FONT',
            layerId: element['id'] as string,
            message: `${element['name']} utilise une police qui n’est pas dans le catalogue licencié.`,
          });
        if (contrastRatio(element['color'] as string, background) < (fontSize >= 32 ? 3 : 4.5))
          problems.push({
            code: 'CONTRAST',
            layerId: element['id'] as string,
            message: `${element['name']} manque de contraste avec le fond du modèle.`,
          });
      }
    }
    return {
      valid: problems.length === 0,
      checked: elements.length,
      problems,
      warnings,
      variables: templateVariables(document),
    };
  }
}
