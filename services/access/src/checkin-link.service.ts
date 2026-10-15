import { BadRequestException, ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { CheckInLinkStatus } from '../generated/prisma/client.js';
import { AccessService } from './access.service.js';
import { ceremonyCheckInExpiry, linkExpiry } from './checkin-link-expiry.js';
import { EventsClient } from './events-client.js';
import { isUuid, requiredEnv } from './env.js';
import { PrismaService } from './prisma.service.js';
import { CheckInLicenseService } from './checkin-license.service.js';

type LinkInput = { label?: unknown; ceremonyIds?: unknown };
type ScanInput = { token?: unknown; ceremonyId?: unknown; companionCount?: unknown };
type CeremonyScope = { id: string; name: string; startAt: Date; endAt: Date | null; timezone: string };
const opaqueToken = /^[A-Za-z0-9_-]{43}$/;

function tokenHash(token: string) { return createHash('sha256').update(token).digest('hex'); }
function tokenCipherKey() { return createHash('sha256').update(`invitaflow-checkin-link\0${requiredEnv('INVITATIONS_INTERNAL_TOKEN')}`).digest(); }
function encryptToken(token: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', tokenCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decryptToken(value: string | null) {
  if (!value) return null;
  try {
    const [version, ivText, tagText, encryptedText] = value.split('.');
    if (version !== 'v1' || !ivText || !tagText || !encryptedText) return null;
    const decipher = createDecipheriv('aes-256-gcm', tokenCipherKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const token = Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8');
    return opaqueToken.test(token) ? token : null;
  } catch { return null; }
}
function safeLabel(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 120 || /[\u0000-\u001f\u007f]/.test(value)) throw new BadRequestException('Le repère de l’accès est invalide.');
  return value.trim();
}
function ceremonyFrom(value: unknown): CeremonyScope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const startAt = typeof row['startAt'] === 'string' ? new Date(row['startAt']) : null;
  const endAt = typeof row['endAt'] === 'string' ? new Date(row['endAt']) : null;
  if (typeof row['id'] !== 'string' || typeof row['name'] !== 'string' || !startAt || Number.isNaN(startAt.getTime())) return null;
  return { id: row['id'], name: row['name'], startAt, endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null, timezone: typeof row['timezone'] === 'string' ? row['timezone'] : '' };
}

@Injectable()
export class CheckInLinkService {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly prisma: PrismaService, private readonly events: EventsClient, private readonly access: AccessService, private readonly licenses?: CheckInLicenseService) {}

  async list(owner: string, eventId: string, authorization: string) {
    this.assertEventId(eventId);
    await this.events.assertManageableCeremonies(eventId, [], authorization);
    const now = new Date();
    const links = await this.prisma.checkInLink.findMany({
      where: { eventId }, orderBy: { createdAt: 'desc' },
      include: { ceremonies: { orderBy: { startAt: 'asc' }, select: { ceremonyId: true, ceremonyName: true, startAt: true, expiresAt: true } } },
    });
    return { items: links.map((link) => {
      const status = link.status === CheckInLinkStatus.REVOKED ? 'REVOKED' : link.expiresAt <= now ? 'EXPIRED' : 'ACTIVE';
      return {
      id: link.id, label: link.label, reference: link.reference, status,
      createdAt: link.createdAt, expiresAt: link.expiresAt, lastUsedAt: link.lastUsedAt,
      ceremonies: link.ceremonies,
      // Only an authorized organiser receives the decrypted token, and only while it is active.
      token: status === 'ACTIVE' ? decryptToken(link.tokenCiphertext) : null,
    }; }) };
  }

  async create(owner: string, eventId: string, input: LinkInput, authorization: string) {
    this.assertEventId(eventId);
    const label = safeLabel(input.label);
    const license = this.licenses ? await this.licenses.entitlementForEvent(owner, eventId, authorization) : null;
    const { event, ceremonies } = await this.scopeFromEvent(eventId, input.ceremonyIds, authorization);
    const timezone = typeof event['timezone'] === 'string' ? event['timezone'] : '';
    const expiresAt = linkExpiry(ceremonies, timezone);
    if (expiresAt <= new Date()) throw new BadRequestException('La période de pointage de ce moment est déjà expirée. Modifiez sa date avant de créer un lien.');
    const token = randomBytes(32).toString('base64url');
    const ownerSubject = typeof event['ownerSubject'] === 'string' ? event['ownerSubject'] : owner;
    const sequence = await this.prisma.checkInLink.count({ where: { eventId } }) + 1;
    const reference = label ?? `Accès accueil ${String(sequence).padStart(2, '0')}`;
    const link = await this.prisma.checkInLink.create({ data: {
      ownerSubject, eventId, ...(license ? { licenseId: license.id } : {}), eventName: String(event['name'] ?? 'Événement'), timezone, label, reference, tokenHash: tokenHash(token), tokenCiphertext: encryptToken(token), expiresAt,
      ceremonies: { create: ceremonies.map((ceremony: CeremonyScope) => ({ ceremonyId: ceremony.id, ceremonyName: ceremony.name, startAt: ceremony.startAt, expiresAt: ceremonyCheckInExpiry(ceremony, timezone) })) },
    }, include: { ceremonies: { orderBy: { startAt: 'asc' } } } });
    return { id: link.id, token, reference: link.reference, expiresAt: link.expiresAt, ceremonies: link.ceremonies.map(({ ceremonyId, ceremonyName, startAt, expiresAt: ceremonyExpiresAt }) => ({ ceremonyId, ceremonyName, startAt, expiresAt: ceremonyExpiresAt })) };
  }

  async revoke(owner: string, eventId: string, id: string, authorization: string) {
    this.assertEventId(eventId); if (!isUuid(id)) throw new BadRequestException('Identifiant d’accès invalide.');
    await this.events.assertManageableCeremonies(eventId, [], authorization);
    const changed = await this.prisma.checkInLink.updateMany({ where: { id, eventId, status: CheckInLinkStatus.ACTIVE }, data: { status: CheckInLinkStatus.REVOKED } });
    if (!changed.count) throw new NotFoundException('Accès de pointage introuvable ou déjà révoqué.');
    return { id, status: 'REVOKED' };
  }

  async replace(owner: string, eventId: string, id: string, authorization: string) {
    this.assertEventId(eventId); if (!isUuid(id)) throw new BadRequestException('Identifiant d’accès invalide.');
    await this.events.assertManageableCeremonies(eventId, [], authorization);
    const current = await this.prisma.checkInLink.findUnique({ where: { id } });
    if (!current || current.eventId !== eventId || current.status !== CheckInLinkStatus.ACTIVE)
      throw new NotFoundException('Accès de pointage introuvable ou déjà révoqué.');
    if (current.expiresAt <= new Date()) throw new GoneException('Ce lien de pointage est expiré et ne peut pas être remplacé.');
    const token = randomBytes(32).toString('base64url');
    await this.prisma.checkInLink.updateMany({ where: { id, eventId, status: CheckInLinkStatus.ACTIVE }, data: { tokenHash: tokenHash(token), tokenCiphertext: encryptToken(token) } });
    return { id, token, reference: current.reference, expiresAt: current.expiresAt };
  }

  async refreshScope(owner: string, eventId: string, id: string, input: LinkInput, authorization: string) {
    this.assertEventId(eventId); if (!isUuid(id)) throw new BadRequestException('Identifiant d’accès invalide.');
    const { event, ceremonies } = await this.scopeFromEvent(eventId, input.ceremonyIds, authorization);
    const timezone = typeof event['timezone'] === 'string' ? event['timezone'] : '';
    const expiresAt = linkExpiry(ceremonies, timezone);
    const link = await this.prisma.$transaction(async (tx) => {
      const current = await tx.checkInLink.findFirst({ where: { id, eventId, status: CheckInLinkStatus.ACTIVE } });
      if (!current) throw new NotFoundException('Accès de pointage introuvable ou révoqué.');
      await tx.checkInLinkCeremonyGrant.deleteMany({ where: { linkId: id } });
      return tx.checkInLink.update({ where: { id }, data: {
        eventName: String(event['name'] ?? current.eventName), timezone, expiresAt,
        ceremonies: { create: ceremonies.map((ceremony: CeremonyScope) => ({ ceremonyId: ceremony.id, ceremonyName: ceremony.name, startAt: ceremony.startAt, expiresAt: ceremonyCheckInExpiry(ceremony, timezone) })) },
      }, include: { ceremonies: { orderBy: { startAt: 'asc' } } } });
    });
    return { id: link.id, expiresAt: link.expiresAt, ceremonies: link.ceremonies };
  }

  async publicContext(token: string) {
    const link = await this.activeLink(token);
    const now = new Date();
    const ceremonies = link.ceremonies.filter((ceremony) => ceremony.expiresAt > now);
    if (!ceremonies.length) throw new GoneException('Ce lien de pointage n’est plus actif. Contactez l’organisateur.');
    return { eventName: link.eventName, reference: link.reference, expiresAt: link.expiresAt, ceremonies: ceremonies.map((ceremony) => ({ id: ceremony.ceremonyId, name: ceremony.ceremonyName, startAt: ceremony.startAt, expiresAt: ceremony.expiresAt })) };
  }

  async publicScan(token: string, input: ScanInput, deviceId?: string, userAgent?: string) {
    const link = await this.activeLink(token);
    this.limit(`scan:${link.tokenHash}`);
    if (typeof input?.token !== 'string' || typeof input.ceremonyId !== 'string' || !isUuid(input.ceremonyId) || (input.companionCount !== undefined && (typeof input.companionCount !== 'number' || !Number.isInteger(input.companionCount) || input.companionCount < 0 || input.companionCount > 20))) throw new BadRequestException('Données de scan invalides.');
    const validInput = input as { token: string; ceremonyId: string; companionCount?: number };
    const grant = link.ceremonies.find((ceremony) => ceremony.ceremonyId === validInput.ceremonyId);
    if (!grant || grant.expiresAt <= new Date()) throw new ForbiddenException('Ce moment n’est pas autorisé ou sa période de pointage est terminée.');
    const delegatedScan = () => this.access.scanDelegated(link.ownerSubject, link.eventId, { token: validInput.token, ceremonyId: validInput.ceremonyId, ...(typeof validInput.companionCount === 'number' ? { companionCount: validInput.companionCount } : {}) }, link.id, deviceId, userAgent) as Promise<{ alreadyCheckedIn?: unknown }>;
    const result = this.licenses
      ? await this.licenses.scanWithinCapacity(link.licenseId, validInput.token, delegatedScan)
      : await delegatedScan();
    await this.prisma.checkInLink.updateMany({ where: { id: link.id, status: CheckInLinkStatus.ACTIVE }, data: { lastUsedAt: new Date() } });
    return result;
  }

  private async activeLink(token: string) {
    if (!opaqueToken.test(token)) throw new NotFoundException('Lien de pointage introuvable.');
    const hash = tokenHash(token); this.limit(`context:${hash}`);
    const link = await this.prisma.checkInLink.findUnique({ where: { tokenHash: hash }, include: { ceremonies: { orderBy: { startAt: 'asc' } } } });
    if (!link) throw new NotFoundException('Lien de pointage introuvable.');
    if (link.status !== CheckInLinkStatus.ACTIVE || link.expiresAt <= new Date()) throw new GoneException('Ce lien de pointage n’est plus actif. Contactez l’organisateur.');
    return link;
  }

  private async scopeFromEvent(eventId: string, rawIds: unknown, authorization: string) {
    if (rawIds !== undefined && (!Array.isArray(rawIds) || rawIds.length < 1 || rawIds.length > 100 || rawIds.some((id) => typeof id !== 'string' || !isUuid(id)) || new Set(rawIds).size !== rawIds.length)) throw new BadRequestException('La portée des moments est invalide.');
    const event = await this.events.assertManageableCeremonies(eventId, rawIds === undefined ? [] : rawIds as string[], authorization);
    const all = Array.isArray(event['ceremonies']) ? event['ceremonies'].flatMap((ceremony: unknown) => { const value = ceremonyFrom(ceremony); return value ? [value] : []; }) : [];
    const selected = rawIds === undefined ? all : all.filter((ceremony: CeremonyScope) => (rawIds as string[]).includes(ceremony.id));
    if (!selected.length) {
      if (all.length === 0 && rawIds === undefined) {
        const startAt = typeof event['startAt'] === 'string' ? new Date(event['startAt']) : null;
        const endAt = typeof event['endAt'] === 'string' ? new Date(event['endAt']) : null;
        if (!startAt || Number.isNaN(startAt.getTime()))
          throw new BadRequestException('Ajoutez la date de début de l’événement avant de créer un lien de pointage global.');
        const globalScope: CeremonyScope = {
          id: eventId,
          name: String(event['name'] ?? 'Événement complet'),
          startAt,
          endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
          timezone: typeof event['timezone'] === 'string' ? event['timezone'] : '',
        };
        return { event, ceremonies: [globalScope] };
      }
      throw new BadRequestException('Ajoutez au moins un moment daté avant de créer un lien de pointage.');
    }
    if (rawIds !== undefined && selected.length !== rawIds.length) throw new BadRequestException('Un moment sélectionné est introuvable.');
    return { event, ceremonies: selected };
  }

  private limit(key: string) {
    const now = Date.now(); const prior = this.attempts.get(key);
    if (!prior || prior.resetAt <= now) { this.attempts.set(key, { count: 1, resetAt: now + 60_000 }); return; }
    if (prior.count >= 60) throw new ForbiddenException('Trop de tentatives. Réessayez dans un instant.');
    prior.count += 1;
  }

  private assertEventId(eventId: string) { if (!isUuid(eventId)) throw new BadRequestException('Identifiant d’événement invalide.'); }
}
