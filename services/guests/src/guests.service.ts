import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GuestStatus, ImportStatus, Prisma } from '../generated/prisma/client.js';
import { EventsClient } from './events-client.js';
import {
  isUnsafeSpreadsheetValue,
  parseGuestFile,
  type ParsedGuestSheet,
} from './guest-import.parser.js';
import { PrismaService } from './prisma.service.js';

type CompanionInput = { fullName: string; relationship?: string | null };
type CeremonyAccessInput = {
  ceremonyId: string;
  isInvited: boolean;
  allowedCompanions: number;
  category?: string | null;
  notes?: string | null;
};
type GuestInput = {
  fullName?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
  groupName?: unknown;
  companions?: unknown;
  access?: unknown;
};
export type GuestMapping = {
  fullName?: number;
  firstName?: number;
  lastName?: number;
  email?: number;
  phone?: number;
  notes?: number;
  groupName?: number;
  allowedCompanions?: number;
  ceremonyColumns?: Record<string, number>;
  ceremonyCompanionColumns?: Record<string, number>;
};
type NormalizedGuest = {
  fullName?: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  groupName?: string | null;
  companions?: CompanionInput[];
  access?: CeremonyAccessInput[];
};
export type PreviewRow = {
  rowNumber: number;
  fullName: string;
  email: string | null;
  phone: string | null;
  groupName: string | null;
  notes: string | null;
  allowedCompanions: number;
  errors: string[];
  ceremonyInvitations: { ceremonyId: string; isInvited: boolean; allowedCompanions: number }[];
};

const guestInclude = {
  group: { select: { id: true, name: true } },
  access: { orderBy: { createdAt: 'asc' as const } },
  companions: { orderBy: { createdAt: 'asc' as const } },
} as const;

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeString(
  value: unknown,
  field: string,
  max: number,
  required = false,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null && !required) return null;
  if (typeof value !== 'string') throw new BadRequestException(`${field} doit être du texte.`);
  const trimmed = value.trim();
  if (required && (trimmed.length < 2 || trimmed.length > max))
    throw new BadRequestException(`${field} doit contenir entre 2 et ${max} caractères.`);
  if (trimmed.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed))
    throw new BadRequestException(`${field} contient des caractères ou une longueur interdits.`);
  return trimmed;
}

function contactEmail(value: unknown): string | null | undefined {
  const email = safeString(value, 'email', 320);
  if (typeof email === 'string') {
    const normalized = email.toLowerCase();
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(normalized) || normalized.startsWith('='))
      throw new BadRequestException('Adresse e-mail invalide.');
    return normalized;
  }
  return email;
}

function contactPhone(value: unknown): string | null | undefined {
  const phone = safeString(value, 'phone', 40);
  if (typeof phone === 'string' && !/^\+?[0-9 ()-]{6,30}$/.test(phone))
    throw new BadRequestException('Numéro de téléphone invalide.');
  return phone;
}

function normalizeCompanions(value: unknown): CompanionInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20)
    throw new BadRequestException('La liste des accompagnants est invalide.');
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new BadRequestException('Un accompagnant est invalide.');
    const record = item as Record<string, unknown>;
    if (Object.keys(record).some((key) => !['fullName', 'relationship'].includes(key)))
      throw new BadRequestException('Champs d’accompagnant non autorisés.');
    const fullName = safeString(record['fullName'], 'Nom de l’accompagnant', 160, true);
    const relationship = safeString(record['relationship'], 'Lien avec l’invité', 80);
    if (typeof fullName !== 'string')
      throw new BadRequestException('Nom de l’accompagnant obligatoire.');
    return { fullName, ...(relationship !== undefined ? { relationship } : {}) };
  });
}

function normalizeAccess(value: unknown): CeremonyAccessInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100)
    throw new BadRequestException('La liste des accès aux cérémonies est invalide.');
  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new BadRequestException('Un accès cérémonie est invalide.');
    const record = item as Record<string, unknown>;
    if (
      Object.keys(record).some(
        (key) =>
          !['ceremonyId', 'isInvited', 'allowedCompanions', 'category', 'notes'].includes(key),
      )
    )
      throw new BadRequestException('Champs d’accès cérémonie non autorisés.');
    if (
      typeof record['ceremonyId'] !== 'string' ||
      !uuid(record['ceremonyId']) ||
      seen.has(record['ceremonyId'])
    )
      throw new BadRequestException('Identifiant de cérémonie invalide ou en double.');
    seen.add(record['ceremonyId']);
    const isInvited = record['isInvited'] === undefined ? true : record['isInvited'];
    const allowedCompanions =
      record['allowedCompanions'] === undefined ? 0 : record['allowedCompanions'];
    if (typeof isInvited !== 'boolean')
      throw new BadRequestException('isInvited doit être un booléen.');
    if (
      typeof allowedCompanions !== 'number' ||
      !Number.isInteger(allowedCompanions) ||
      allowedCompanions < 0 ||
      allowedCompanions > 20 ||
      (!isInvited && allowedCompanions > 0)
    )
      throw new BadRequestException('Nombre d’accompagnants autorisés invalide.');
    const category = safeString(record['category'], 'category', 80);
    const notes = safeString(record['notes'], 'access notes', 1000);
    return {
      ceremonyId: record['ceremonyId'],
      isInvited,
      allowedCompanions,
      ...(category !== undefined ? { category } : {}),
      ...(notes !== undefined ? { notes } : {}),
    };
  });
}

function normalizedHeaders(headers: string[]) {
  return headers.map((header) =>
    header
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, ' '),
  );
}

function suggestMapping(headers: string[]): GuestMapping {
  const normalized = normalizedHeaders(headers);
  const find = (labels: string[]) => normalized.findIndex((header) => labels.includes(header));
  const fullName = find([
    'full name',
    'fullname',
    'name',
    'nom complet',
    'nom prenom',
    'invite',
    'guest',
    'guest name',
  ]);
  const mapping: GuestMapping = fullName >= 0 ? { fullName } : {};
  if (fullName < 0) {
    const firstName = find(['first name', 'firstname', 'prenom', 'given name']);
    const lastName = find([
      'last name',
      'lastname',
      'nom',
      'nom de famille',
      'surname',
      'family name',
    ]);
    if (firstName >= 0) mapping.firstName = firstName;
    if (lastName >= 0) mapping.lastName = lastName;
    if (mapping.firstName === undefined && mapping.lastName === undefined) mapping.fullName = 0;
  }
  const email = find(['email', 'e mail', 'courriel', 'adresse email']);
  if (email >= 0) mapping.email = email;
  const phone = find(['phone', 'telephone', 'tel', 'mobile', 'whatsapp']);
  if (phone >= 0) mapping.phone = phone;
  const groupName = find(['group', 'groupe', 'famille', 'guest group']);
  if (groupName >= 0) mapping.groupName = groupName;
  const notes = find(['notes', 'note', 'commentaire', 'commentaires']);
  if (notes >= 0) mapping.notes = notes;
  const allowedCompanions = find([
    'companions',
    'allowed companions',
    'accompagnants',
    'accompagnants autorises',
    'nombre accompagnants',
    'plus ones',
  ]);
  if (allowedCompanions >= 0) mapping.allowedCompanions = allowedCompanions;
  return mapping;
}

function mapImportColumns(
  value: unknown,
  columnCount: number,
  validCeremonies: Set<string>,
): GuestMapping {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Le mapping des colonnes est invalide.');
  const input = value as Record<string, unknown>;
  const allowed = [
    'fullName',
    'firstName',
    'lastName',
    'email',
    'phone',
    'notes',
    'groupName',
    'allowedCompanions',
    'ceremonyColumns',
    'ceremonyCompanionColumns',
  ];
  if (
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    !['fullName', 'firstName', 'lastName'].some((key) => Number.isInteger(input[key]))
  )
    throw new BadRequestException('Associez une colonne au nom complet, au prénom ou au nom.');
  const mapping = input as unknown as GuestMapping;
  const indexes: number[] = [];
  for (const key of [
    'fullName',
    'firstName',
    'lastName',
    'email',
    'phone',
    'notes',
    'groupName',
    'allowedCompanions',
  ]) {
    const index = input[key];
    if (index === undefined) continue;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= columnCount)
      throw new BadRequestException(`Index de colonne invalide pour ${key}.`);
    indexes.push(index);
  }
  for (const key of ['ceremonyColumns', 'ceremonyCompanionColumns']) {
    const group = input[key];
    if (group === undefined) continue;
    if (!group || typeof group !== 'object' || Array.isArray(group))
      throw new BadRequestException('Le mapping des cérémonies est invalide.');
    for (const [ceremonyId, index] of Object.entries(group as Record<string, unknown>)) {
      if (
        !validCeremonies.has(ceremonyId) ||
        typeof index !== 'number' ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= columnCount
      )
        throw new BadRequestException('Une colonne ou cérémonie du mapping est invalide.');
      indexes.push(index);
    }
  }
  if (new Set(indexes).size !== indexes.length)
    throw new BadRequestException('Une colonne ne peut être utilisée que pour un seul champ.');
  return mapping;
}

export function previewGuestRows(
  sheet: ParsedGuestSheet,
  mapping: GuestMapping,
  alreadySeenEmails: Set<string>,
  defaultCeremonyIds: string[] = [],
): PreviewRow[] {
  const seen = new Set<string>();
  return sheet.rows.map((row, index) => {
    const read = (column: number | undefined) => (column === undefined ? '' : (row[column] ?? ''));
    const rawName = (
      mapping.fullName !== undefined
        ? read(mapping.fullName)
        : [read(mapping.firstName), read(mapping.lastName)].filter(Boolean).join(' ')
    ).trim();
    const rawEmail = read(mapping.email).trim().toLowerCase();
    const rawPhone = read(mapping.phone).trim();
    const rawGroup = read(mapping.groupName).trim();
    const rawNotes = read(mapping.notes).trim();
    const rawCompanions = read(mapping.allowedCompanions).trim();
    const errors: string[] = [];
    const checkFormula = (value: string, field: string, isPhone = false) => {
      if (isUnsafeSpreadsheetValue(value, isPhone))
        errors.push(`${field}: formule ou valeur à risque`);
    };
    checkFormula(rawName, 'Nom');
    checkFormula(rawEmail, 'E-mail');
    checkFormula(rawPhone, 'Téléphone', true);
    checkFormula(rawGroup, 'Groupe');
    checkFormula(rawNotes, 'Notes');
    if (rawName.length < 2 || rawName.length > 160)
      errors.push('Le nom doit contenir de 2 à 160 caractères');
    if (rawEmail && (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(rawEmail) || rawEmail.length > 320))
      errors.push('Adresse e-mail invalide');
    if (rawPhone && !/^\+?[0-9 ()-]{6,30}$/.test(rawPhone))
      errors.push('Numéro de téléphone invalide');
    if (rawNotes.length > 2000 || rawGroup.length > 100) errors.push('Groupe ou notes trop longs');
    const companions = rawCompanions ? Number(rawCompanions) : 0;
    if (!Number.isInteger(companions) || companions < 0 || companions > 20)
      errors.push('Nombre d’accompagnants invalide');
    const ceremonyInvitations = [
      ...new Set([...defaultCeremonyIds, ...Object.keys(mapping.ceremonyColumns ?? {})]),
    ].map((ceremonyId) => {
      const column = mapping.ceremonyColumns?.[ceremonyId];
      const rawAllowed = read(mapping.ceremonyCompanionColumns?.[ceremonyId]).trim();
      const allowedCompanions = rawAllowed ? Number(rawAllowed) : companions;
      if (!Number.isInteger(allowedCompanions) || allowedCompanions < 0 || allowedCompanions > 20)
        errors.push('Nombre d’accompagnants invalide pour une cérémonie');
      if (column === undefined)
        return {
          ceremonyId,
          isInvited: true,
          allowedCompanions:
            Number.isInteger(allowedCompanions) && allowedCompanions >= 0 && allowedCompanions <= 20
              ? allowedCompanions
              : 0,
        };
      const value = read(column).trim().toLocaleLowerCase('fr');
      if (['oui', 'yes', 'true', '1', 'y'].includes(value)) {
        return {
          ceremonyId,
          isInvited: true,
          allowedCompanions:
            Number.isInteger(allowedCompanions) && allowedCompanions >= 0 && allowedCompanions <= 20
              ? allowedCompanions
              : 0,
        };
      }
      if (['non', 'no', 'false', '0', 'n', ''].includes(value))
        return { ceremonyId, isInvited: false, allowedCompanions: 0 };
      errors.push(`Accès cérémonie invalide : ${value}`);
      return { ceremonyId, isInvited: false, allowedCompanions: 0 };
    });
    if (rawEmail && !errors.length) {
      if (alreadySeenEmails.has(rawEmail) || seen.has(rawEmail))
        errors.push('Cette adresse e-mail existe déjà dans l’événement');
      seen.add(rawEmail);
    }
    return {
      rowNumber: index + 2,
      fullName: rawName,
      email: rawEmail || null,
      phone: rawPhone || null,
      groupName: rawGroup || null,
      notes: rawNotes || null,
      allowedCompanions:
        Number.isInteger(companions) && companions >= 0 && companions <= 20 ? companions : 0,
      errors,
      ceremonyInvitations,
    };
  });
}

@Injectable()
export class GuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsClient,
  ) {}

  private async assertEvent(
    eventId: string,
    _ownerSubject: string,
    authorization: string,
    ceremonyIds: string[] = [],
  ) {
    if (!uuid(eventId)) throw new NotFoundException('Event not found');
    const event = await this.events.assertCeremonies(eventId, ceremonyIds, authorization, true);
    return event;
  }

  async list(
    ownerSubject: string,
    eventId: string,
    authorization: string,
    limit: number,
    cursor?: string,
    search?: string,
    groupId?: string,
    ceremonyId?: string,
  ) {
    await this.assertEvent(eventId, ownerSubject, authorization, ceremonyId ? [ceremonyId] : []);
    if (groupId && !uuid(groupId)) throw new BadRequestException('groupId doit être un UUID.');
    if (ceremonyId && !uuid(ceremonyId))
      throw new BadRequestException('ceremonyId doit être un UUID.');
    const where: Prisma.GuestWhereInput = {
      ownerSubject,
      eventId,
      deletedAt: null,
      ...(groupId ? { groupId } : {}),
      ...(ceremonyId ? { access: { some: { ceremonyId, isInvited: true } } } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    if (cursor) {
      if (
        !uuid(cursor) ||
        !(await this.prisma.guest.findFirst({
          where: { id: cursor, ...where },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Guest not found');
    }
    const rows = await this.prisma.guest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: guestInclude,
    });
    const more = rows.length > limit;
    const items = rows.slice(0, limit);
    return {
      items,
      total: await this.prisma.guest.count({ where }),
      nextCursor: more ? (items.at(-1)?.id ?? null) : null,
    };
  }

  async get(ownerSubject: string, eventId: string, guestId: string, authorization: string) {
    await this.assertEvent(eventId, ownerSubject, authorization);
    if (!uuid(guestId)) throw new NotFoundException('Guest not found');
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, eventId, ownerSubject, deletedAt: null },
      include: guestInclude,
    });
    if (!guest) throw new NotFoundException('Guest not found');
    return guest;
  }

  async create(ownerSubject: string, eventId: string, authorization: string, body: GuestInput) {
    const normalized = this.normalizeGuest(body, true);
    await this.assertEvent(
      eventId,
      ownerSubject,
      authorization,
      normalized.access?.map(({ ceremonyId }) => ceremonyId),
    );
    return this.saveGuest(ownerSubject, eventId, normalized);
  }

  async update(
    ownerSubject: string,
    eventId: string,
    guestId: string,
    authorization: string,
    body: GuestInput,
  ) {
    if (!uuid(guestId)) throw new NotFoundException('Guest not found');
    await this.get(ownerSubject, eventId, guestId, authorization);
    const normalized = this.normalizeGuest(body, false);
    await this.assertEvent(
      eventId,
      ownerSubject,
      authorization,
      normalized.access?.map(({ ceremonyId }) => ceremonyId),
    );
    return this.saveGuest(ownerSubject, eventId, normalized, guestId);
  }

  async archive(ownerSubject: string, eventId: string, guestId: string, authorization: string) {
    await this.assertEvent(eventId, ownerSubject, authorization);
    if (!uuid(guestId)) throw new NotFoundException('Guest not found');
    const changed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.guest.updateMany({
        where: { id: guestId, ownerSubject, eventId, deletedAt: null },
        data: { status: GuestStatus.ARCHIVED, deletedAt: new Date() },
      });
      if (result.count)
        await tx.outboxMessage.create({
          data: {
            eventType: 'guest.archived.v1',
            aggregateId: guestId,
            payload: {
              guestId,
              eventId,
              ownerSubject,
              occurredAt: new Date().toISOString(),
              schemaVersion: 1,
            },
          },
        });
      return result.count;
    });
    if (!changed) throw new NotFoundException('Guest not found');
    return { archived: true };
  }

  async groups(ownerSubject: string, eventId: string, authorization: string) {
    await this.assertEvent(eventId, ownerSubject, authorization);
    return this.prisma.guestGroup.findMany({
      where: { ownerSubject, eventId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { guests: { where: { deletedAt: null } } } } },
    });
  }

  async createGroup(ownerSubject: string, eventId: string, authorization: string, input: unknown) {
    await this.assertEvent(eventId, ownerSubject, authorization);
    const body = input as Record<string, unknown>;
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'name')
    )
      throw new BadRequestException('Fournissez un nom de groupe valide.');
    const name = safeString(body['name'], 'Nom du groupe', 100, true);
    if (typeof name !== 'string') throw new BadRequestException('Nom du groupe obligatoire.');
    return this.prisma.$transaction(async (tx) => {
      const group = await tx.guestGroup.upsert({
        where: { eventId_name: { eventId, name } },
        create: { ownerSubject, eventId, name },
        update: {},
        include: { _count: { select: { guests: true } } },
      });
      await tx.outboxMessage.create({
        data: {
          eventType: 'guest.group.updated.v1',
          aggregateId: group.id,
          payload: {
            groupId: group.id,
            eventId,
            ownerSubject,
            occurredAt: new Date().toISOString(),
            schemaVersion: 1,
          },
        },
      });
      return group;
    });
  }

  async updateGroup(
    ownerSubject: string,
    eventId: string,
    groupId: string,
    authorization: string,
    input: unknown,
  ) {
    await this.assertEvent(eventId, ownerSubject, authorization);
    if (
      !uuid(groupId) ||
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input as object).some((key) => key !== 'name')
    )
      throw new BadRequestException('Fournissez un nom de groupe valide.');
    const name = safeString((input as Record<string, unknown>)['name'], 'Nom du groupe', 100, true);
    if (!name) throw new BadRequestException('Nom du groupe obligatoire.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const group = await tx.guestGroup.update({
          where: { id: groupId, ownerSubject, eventId },
          data: { name },
          include: { _count: { select: { guests: true } } },
        });
        await tx.outboxMessage.create({
          data: {
            eventType: 'guest.group.updated.v1',
            aggregateId: group.id,
            payload: {
              groupId: group.id,
              eventId,
              ownerSubject,
              occurredAt: new Date().toISOString(),
              schemaVersion: 1,
            },
          },
        });
        return group;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Ce nom de groupe existe déjà.');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
        throw new NotFoundException('Groupe introuvable.');
      throw error;
    }
  }

  async deleteGroup(ownerSubject: string, eventId: string, groupId: string, authorization: string) {
    await this.assertEvent(eventId, ownerSubject, authorization);
    if (!uuid(groupId)) throw new NotFoundException('Groupe introuvable.');
    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.guestGroup.deleteMany({
        where: { id: groupId, ownerSubject, eventId },
      });
      if (result.count)
        await tx.outboxMessage.create({
          data: {
            eventType: 'guest.group.deleted.v1',
            aggregateId: groupId,
            payload: {
              groupId,
              eventId,
              ownerSubject,
              occurredAt: new Date().toISOString(),
              schemaVersion: 1,
            },
          },
        });
      return result.count;
    });
    if (!deleted) throw new NotFoundException('Groupe introuvable.');
    return { deleted: true };
  }

  private normalizeGuest(input: GuestInput, creating: boolean): NormalizedGuest {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('Corps de requête invalide.');
    const body = input as Record<string, unknown>;
    const allowed = ['fullName', 'email', 'phone', 'notes', 'groupName', 'companions', 'access'];
    if (Object.keys(body).some((key) => !allowed.includes(key)))
      throw new BadRequestException('Champs d’invité non autorisés.');
    const fullName = safeString(body['fullName'], 'Nom complet', 160, creating);
    if (body['fullName'] !== undefined && (typeof fullName !== 'string' || fullName.length < 2))
      throw new BadRequestException('Nom complet doit contenir au moins 2 caractères.');
    const email = contactEmail(body['email']);
    const phone = contactPhone(body['phone']);
    const notes = safeString(body['notes'], 'Notes', 2000);
    const groupName = safeString(body['groupName'], 'Groupe', 100);
    const companions = normalizeCompanions(body['companions']);
    const access = normalizeAccess(body['access']);
    if (!creating && Object.keys(body).length === 0)
      throw new BadRequestException('Fournissez au moins un champ à modifier.');
    if (creating && typeof fullName !== 'string')
      throw new BadRequestException('Nom complet obligatoire.');
    if (
      companions &&
      access &&
      access.filter(({ isInvited }) => isInvited).length === 0 &&
      companions.length > 0
    )
      throw new BadRequestException(
        'Un invité sans cérémonie autorisée ne peut pas avoir d’accompagnants.',
      );
    return {
      ...(fullName !== undefined ? { fullName: fullName as string } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(groupName !== undefined ? { groupName } : {}),
      ...(companions ? { companions } : {}),
      ...(access ? { access } : {}),
    };
  }

  private async saveGuest(
    ownerSubject: string,
    eventId: string,
    normalized: NormalizedGuest,
    guestId?: string,
  ) {
    const { companions, access, groupName, ...guestFields } = normalized;
    const scalar: Prisma.GuestUncheckedUpdateInput = { ...guestFields };
    try {
      return await this.prisma.$transaction(async (tx) => {
        let groupId: string | null | undefined;
        if (groupName !== undefined) {
          if (!groupName) groupId = null;
          else {
            const group = await tx.guestGroup.upsert({
              where: { eventId_name: { eventId, name: groupName } },
              create: { ownerSubject, eventId, name: groupName },
              update: {},
              select: { id: true },
            });
            groupId = group.id;
          }
        }
        const guest = guestId
          ? await tx.guest.update({
              where: { id: guestId, ownerSubject, eventId, deletedAt: null },
              data: { ...scalar, ...(groupId !== undefined ? { groupId } : {}) },
              include: guestInclude,
            })
          : await tx.guest.create({
              data: {
                ...scalar,
                ownerSubject,
                eventId,
                ...(groupId !== undefined ? { groupId } : {}),
              } as Prisma.GuestUncheckedCreateInput,
              include: guestInclude,
            });
        if (companions) {
          await tx.companion.deleteMany({ where: { guestId: guest.id } });
          if (companions.length)
            await tx.companion.createMany({
              data: companions.map((companion) => ({
                guestId: guest.id,
                fullName: companion.fullName,
                relationship: companion.relationship ?? null,
              })),
            });
        }
        if (access) {
          await tx.guestCeremonyAccess.deleteMany({ where: { guestId: guest.id } });
          if (access.length)
            await tx.guestCeremonyAccess.createMany({
              data: access.map((item) => ({
                guestId: guest.id,
                ceremonyId: item.ceremonyId,
                isInvited: item.isInvited,
                allowedCompanions: item.allowedCompanions,
                category: item.category ?? null,
                notes: item.notes ?? null,
              })),
            });
        }
        await tx.outboxMessage.create({
          data: {
            eventType: guestId ? 'guest.updated.v1' : 'guest.created.v1',
            aggregateId: guest.id,
            payload: {
              guestId: guest.id,
              eventId,
              ownerSubject,
              occurredAt: new Date().toISOString(),
              schemaVersion: 1,
            },
          },
        });
        return tx.guest.findFirstOrThrow({
          where: { id: guest.id, ownerSubject, eventId },
          include: guestInclude,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException(
          'Un invité de cet événement utilise déjà cette adresse e-mail.',
        );
      throw error;
    }
  }

  async updateAccess(
    ownerSubject: string,
    eventId: string,
    guestId: string,
    authorization: string,
    input: unknown,
  ) {
    if (!uuid(guestId)) throw new NotFoundException('Guest not found');
    if (!Array.isArray(input))
      throw new BadRequestException('La liste des accès doit être un tableau.');
    const access = normalizeAccess(input);
    if (!access) throw new BadRequestException('La liste des accès est invalide.');
    await this.assertEvent(
      eventId,
      ownerSubject,
      authorization,
      access.map(({ ceremonyId }) => ceremonyId),
    );
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, ownerSubject, eventId, deletedAt: null },
      select: { id: true },
    });
    if (!guest) throw new NotFoundException('Guest not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.guestCeremonyAccess.deleteMany({ where: { guestId } });
      if (access.length)
        await tx.guestCeremonyAccess.createMany({
          data: access.map((item) => ({
            guestId,
            ceremonyId: item.ceremonyId,
            isInvited: item.isInvited,
            allowedCompanions: item.allowedCompanions,
            category: item.category ?? null,
            notes: item.notes ?? null,
          })),
        });
      await tx.outboxMessage.create({
        data: {
          eventType: 'guest.ceremony-access.updated.v1',
          aggregateId: guestId,
          payload: {
            guestId,
            eventId,
            ownerSubject,
            occurredAt: new Date().toISOString(),
            schemaVersion: 1,
          },
        },
      });
      return tx.guest.findFirstOrThrow({
        where: { id: guestId, ownerSubject, eventId },
        include: guestInclude,
      });
    });
  }

  async removeCeremonyAccess(
    ownerSubject: string,
    eventId: string,
    guestId: string,
    ceremonyId: string,
    authorization: string,
  ) {
    if (!uuid(guestId) || !uuid(ceremonyId))
      throw new NotFoundException('Invité ou cérémonie introuvable.');
    await this.assertEvent(eventId, ownerSubject, authorization, [ceremonyId]);
    const guest = await this.prisma.guest.findFirst({
      where: { id: guestId, ownerSubject, eventId, deletedAt: null },
      select: { id: true },
    });
    if (!guest) throw new NotFoundException('Invité introuvable.');
    await this.prisma.$transaction(async (tx) => {
      await tx.guestCeremonyAccess.deleteMany({ where: { guestId, ceremonyId } });
      await tx.outboxMessage.create({
        data: {
          eventType: 'guest.ceremony-access.updated.v1',
          aggregateId: guestId,
          payload: {
            guestId,
            eventId,
            ownerSubject,
            occurredAt: new Date().toISOString(),
            schemaVersion: 1,
          },
        },
      });
    });
    return { removed: true };
  }

  async analyzeImport(
    ownerSubject: string,
    eventId: string,
    authorization: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer,
  ) {
    await this.assertEvent(eventId, ownerSubject, authorization);
    const sheet = await parseGuestFile(fileName, mimeType, buffer);
    const headers = sheet.headers.map((label, index) => ({ index, label }));
    const job = await this.prisma.$transaction(async (tx) => {
      const created = await tx.importJob.create({
        data: {
          ownerSubject,
          eventId,
          originalName: fileName.replace(/[\\/\x00-\x1f]/g, '_').slice(-255),
          fileType: fileName.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv',
          status: ImportStatus.ANALYZED,
          columns: { sheetName: sheet.sheetName, headers },
          sourceRows: sheet.rows,
        },
      });
      await tx.outboxMessage.create({
        data: {
          eventType: 'guest.import.started.v1',
          aggregateId: created.id,
          payload: {
            importJobId: created.id,
            eventId,
            ownerSubject,
            rowCount: sheet.rows.length,
            occurredAt: new Date().toISOString(),
            schemaVersion: 1,
          },
        },
      });
      return created;
    });
    return {
      id: job.id,
      originalName: job.originalName,
      status: job.status,
      sheetName: sheet.sheetName,
      columns: headers,
      suggestedMapping: suggestMapping(sheet.headers),
      rowCount: sheet.rows.length,
    };
  }

  async getImport(ownerSubject: string, eventId: string, jobId: string, authorization: string) {
    await this.assertEvent(eventId, ownerSubject, authorization);
    if (!uuid(jobId)) throw new NotFoundException('Import job not found');
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, ownerSubject, eventId },
      select: {
        id: true,
        originalName: true,
        fileType: true,
        status: true,
        columns: true,
        mapping: true,
        ceremonyIds: true,
        preview: true,
        resultSummary: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!job) throw new NotFoundException('Import job not found');
    return job;
  }

  async mapImport(
    ownerSubject: string,
    eventId: string,
    jobId: string,
    authorization: string,
    input: unknown,
  ) {
    await this.assertEvent(eventId, ownerSubject, authorization);
    if (!uuid(jobId)) throw new NotFoundException('Import job not found');
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('Mapping invalide.');
    const body = input as Record<string, unknown>;
    if (Object.keys(body).some((key) => !['mapping', 'ceremonyIds'].includes(key)))
      throw new BadRequestException('Champs de mapping non autorisés.');
    const ceremonyIds = body['ceremonyIds'] ?? [];
    if (
      !Array.isArray(ceremonyIds) ||
      ceremonyIds.some((id) => typeof id !== 'string' || !uuid(id))
    )
      throw new BadRequestException('Cérémonies sélectionnées invalides.');
    await this.assertEvent(eventId, ownerSubject, authorization, ceremonyIds as string[]);
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, eventId, ownerSubject },
      select: { id: true, status: true, columns: true, sourceRows: true },
    });
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status === ImportStatus.COMPLETED)
      throw new BadRequestException('Cet import est déjà terminé.');
    const columns = job.columns as { headers?: Array<{ index: number; label: string }> };
    const rows = job.sourceRows as string[][];
    const ceremonyList = ceremonyIds as string[];
    const mapping = mapImportColumns(
      body['mapping'],
      columns.headers?.length ?? 0,
      new Set(ceremonyList),
    );
    const emails = (
      await this.prisma.guest.findMany({
        where: { ownerSubject, eventId, email: { not: null } },
        select: { email: true },
      })
    ).map(({ email }) => email!.toLowerCase());
    const preview = previewGuestRows(
      { sheetName: '', headers: (columns.headers ?? []).map(({ label }) => label), rows },
      mapping,
      new Set(emails),
      ceremonyList,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.importJob.update({
        where: { id: jobId },
        data: {
          status: ImportStatus.MAPPED,
          mapping: mapping as unknown as Prisma.InputJsonValue,
          ceremonyIds: ceremonyList as unknown as Prisma.InputJsonValue,
          preview: preview as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.outboxMessage.create({
        data: {
          eventType: 'guest.import.validated.v1',
          aggregateId: jobId,
          payload: {
            importJobId: jobId,
            eventId,
            ownerSubject,
            validRows: preview.filter(({ errors }) => errors.length === 0).length,
            rejectedRows: preview.filter(({ errors }) => errors.length > 0).length,
            occurredAt: new Date().toISOString(),
            schemaVersion: 1,
          },
        },
      });
    });
    return {
      id: jobId,
      status: ImportStatus.MAPPED,
      rowCount: preview.length,
      validCount: preview.filter(({ errors }) => errors.length === 0).length,
      invalidCount: preview.filter(({ errors }) => errors.length > 0).length,
      preview,
      ceremonyIds: ceremonyList,
    };
  }

  async commitImport(ownerSubject: string, eventId: string, jobId: string, authorization: string) {
    await this.assertEvent(eventId, ownerSubject, authorization);
    if (!uuid(jobId)) throw new NotFoundException('Import job not found');
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, ownerSubject, eventId },
      select: {
        id: true,
        status: true,
        sourceRows: true,
        columns: true,
        mapping: true,
        ceremonyIds: true,
        resultSummary: true,
      },
    });
    if (!job) throw new NotFoundException('Import job not found');
    if (job.status === ImportStatus.COMPLETED) return job.resultSummary;
    if (job.status !== ImportStatus.MAPPED || !job.mapping)
      throw new BadRequestException('Analysez le fichier et validez le mapping avant l’import.');
    const ceremonyIds = (job.ceremonyIds ?? []) as string[];
    await this.assertEvent(eventId, ownerSubject, authorization, ceremonyIds);
    const cols = job.columns as { headers?: Array<{ index: number; label: string }> };
    const rows = job.sourceRows as string[][];
    const sheet: ParsedGuestSheet = {
      sheetName: '',
      headers: (cols.headers ?? []).map(({ label }) => label),
      rows,
    };
    const mapping = job.mapping as unknown as GuestMapping;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "import_jobs" WHERE "id" = ${jobId}::uuid AND "owner_subject" = ${ownerSubject} AND "event_id" = ${eventId}::uuid FOR UPDATE`;
          const locked = await tx.importJob.findFirst({
            where: { id: jobId, ownerSubject, eventId },
          });
          if (!locked) throw new NotFoundException('Import job not found');
          if (locked.status === ImportStatus.COMPLETED) return locked.resultSummary;
          if (locked.status !== ImportStatus.MAPPED)
            throw new BadRequestException('Cet import doit être remappé avant sa validation.');
          const emails = (
            await tx.guest.findMany({
              where: { ownerSubject, eventId, email: { not: null } },
              select: { email: true },
            })
          ).map(({ email }) => email!.toLowerCase());
          const preview = previewGuestRows(sheet, mapping, new Set(emails), ceremonyIds);
          const valid = preview.filter(({ errors }) => errors.length === 0);
          if (valid.length === 0) throw new BadRequestException('Aucune ligne valide à importer.');
          const groups = [
            ...new Set(valid.flatMap(({ groupName }) => (groupName ? [groupName] : []))),
          ];
          if (groups.length)
            await tx.guestGroup.createMany({
              data: groups.map((name) => ({ ownerSubject, eventId, name })),
              skipDuplicates: true,
            });
          const groupRows = groups.length
            ? await tx.guestGroup.findMany({
                where: { ownerSubject, eventId, name: { in: groups } },
                select: { id: true, name: true },
              })
            : [];
          const groupIds = new Map(groupRows.map(({ name, id }) => [name, id]));
          const created = valid.map((row) => ({
            id: randomUUID(),
            row,
            groupId: row.groupName ? groupIds.get(row.groupName) : undefined,
          }));
          await tx.guest.createMany({
            data: created.map(({ id, row, groupId }) => ({
              id,
              ownerSubject,
              eventId,
              fullName: row.fullName,
              email: row.email,
              phone: row.phone,
              notes: row.notes,
              ...(groupId ? { groupId } : {}),
              updatedAt: new Date(),
            })),
          });
          const accessRows = created.flatMap(({ id, row }) =>
            row.ceremonyInvitations
              .filter(({ isInvited }) => isInvited)
              .map(({ ceremonyId, allowedCompanions }) => ({
                guestId: id,
                ceremonyId,
                allowedCompanions,
                isInvited: true,
                updatedAt: new Date(),
              })),
          );
          if (accessRows.length) await tx.guestCeremonyAccess.createMany({ data: accessRows });
          await tx.outboxMessage.create({
            data: {
              eventType: 'guest.import.completed.v1',
              aggregateId: jobId,
              payload: {
                importJobId: jobId,
                eventId,
                ownerSubject,
                importedCount: valid.length,
                skippedCount: preview.length - valid.length,
                occurredAt: new Date().toISOString(),
                schemaVersion: 1,
              },
            },
          });
          const resultSummary = {
            importedCount: valid.length,
            skippedCount: preview.length - valid.length,
            totalRows: preview.length,
          };
          await tx.importJob.update({
            where: { id: jobId },
            data: {
              status: ImportStatus.COMPLETED,
              sourceRows: Prisma.JsonNull,
              preview: Prisma.JsonNull,
              resultSummary,
            },
          });
          return resultSummary;
        },
        { timeout: 15_000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException(
          'Un invité de cet événement utilise déjà cette adresse e-mail. Recalculez l’aperçu avant de réessayer.',
        );
      throw error;
    }
  }
}
