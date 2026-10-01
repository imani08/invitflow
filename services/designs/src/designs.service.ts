import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DesignStatus, Prisma, TemplateCategory } from '../generated/prisma/client.js';
import { EventsClient } from './events-client.js';
import { PrismaService } from './prisma.service.js';
import { templateVariables, validateDesignDocument } from './design-document.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories = new Set<string>(Object.values(TemplateCategory));

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

  private async event(eventId: string, authorization: string) {
    if (!uuidPattern.test(eventId)) throw new NotFoundException('Événement introuvable.');
    await this.events.assertOwnerEvent(eventId, authorization);
  }

  async listTemplates(eventId: string, authorization: string, rawCategory?: string) {
    await this.event(eventId, authorization);
    if (rawCategory && !categories.has(rawCategory))
      throw new BadRequestException('Catégorie de template invalide.');
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
      },
    });
    return { items };
  }

  async getTemplate(eventId: string, authorization: string, templateId: string) {
    await this.event(eventId, authorization);
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
      },
    });
    if (!template) throw new NotFoundException('Template introuvable.');
    return template;
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
    return design;
  }

  async create(eventId: string, ownerSubject: string, authorization: string, body: unknown) {
    await this.event(eventId, authorization);
    const input = object(body, 'Le design');
    if (Object.keys(input).some((key) => !['templateId', 'name'].includes(key)))
      throw new BadRequestException('Champs non pris en charge.');
    const name = text(input['name'], 'Le nom du design', 120);
    const templateId = input['templateId'];
    if (typeof templateId !== 'string' || !uuidPattern.test(templateId))
      throw new BadRequestException('Choisissez un template enregistré.');
    const template = await this.prisma.designTemplate.findFirst({
      where: { id: templateId, isActive: true },
    });
    if (!template) throw new NotFoundException('Template introuvable.');
    const document = validateDesignDocument(template.document);
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
      return design;
    });
    return version;
  }

  async update(
    eventId: string,
    ownerSubject: string,
    authorization: string,
    designId: string,
    body: unknown,
  ) {
    await this.event(eventId, authorization);
    if (!uuidPattern.test(designId)) throw new NotFoundException('Design introuvable.');
    const input = object(body, 'Le design');
    if (Object.keys(input).some((key) => !['name', 'document', 'expectedVersion'].includes(key)))
      throw new BadRequestException('Champs non pris en charge.');
    if (!Number.isInteger(input['expectedVersion']) || (input['expectedVersion'] as number) < 1)
      throw new BadRequestException('Rechargez le design avant de le modifier.');
    const name = text(input['name'], 'Le nom du design', 120);
    const document = validateDesignDocument(input['document']);
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
      const nextDocument = { ...document, version: nextVersion };
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
    return { items };
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
    });
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
    const document = validateDesignDocument(documentValue);
    const elements = document['elements'] as Record<string, unknown>[];
    const safeMargin = (document['constraints'] as Record<string, unknown>)['safeMargin'] as number;
    const canvas = document['canvas'] as Record<string, unknown>;
    const background = (document['theme']['tokens'] as Record<string, unknown>)[
      'background'
    ] as string;
    const problems: { code: string; layerId?: string; message: string }[] = [];
    for (const element of elements) {
      if (element['editable'] && !element['locked'] && (element['x'] as number) < safeMargin)
        problems.push({
          code: 'SAFE_MARGIN',
          layerId: element['id'] as string,
          message: `${element['name']} est trop près du bord gauche.`,
        });
      if (
        element['editable'] &&
        !element['locked'] &&
        (element['x'] as number) + (element['width'] as number) >
          (canvas['width'] as number) - safeMargin
      )
        problems.push({
          code: 'SAFE_MARGIN',
          layerId: element['id'] as string,
          message: `${element['name']} est trop près du bord droit.`,
        });
      if (element['editable'] && !element['locked'] && (element['y'] as number) < safeMargin)
        problems.push({
          code: 'SAFE_MARGIN',
          layerId: element['id'] as string,
          message: `${element['name']} est trop près du bord supérieur.`,
        });
      if (
        element['editable'] &&
        !element['locked'] &&
        (element['y'] as number) + (element['height'] as number) >
          (canvas['height'] as number) - safeMargin
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
        const estimatedLines = rendered.split('\n').reduce((total, paragraph) => {
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
        const availableLines = Math.max(
          1,
          Math.floor((element['height'] as number) / (fontSize * 1.25)),
        );
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
      variables: templateVariables(document),
    };
  }
}
