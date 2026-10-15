import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { KeycloakDirectory } from './keycloak-directory.js';
import { PrismaService } from './prisma.service.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ownerPattern = /^[^\u0000-\u001f\u007f]{1,255}$/;
type EventEnvelope = { eventId?: unknown; eventType?: unknown; payload?: unknown };
type NotificationContent = { category: string; title: string; message: string };

function owner(value: string) {
  if (!ownerPattern.test(value)) throw new BadRequestException('Identité invalide.');
  return value;
}

function content(eventType: string, payload: Record<string, unknown>): NotificationContent | null {
  const eventName = typeof payload['name'] === 'string' ? payload['name'].trim().slice(0, 120) : '';
  switch (eventType) {
    case 'events.published.v1': return { category: 'events', title: 'Événement publié', message: eventName ? `« ${eventName} » est maintenant publié.` : 'Votre événement est maintenant publié.' };
    case 'events.cancelled.v1': return { category: 'events', title: 'Événement annulé', message: eventName ? `« ${eventName} » a été annulé.` : 'Un de vos événements a été annulé.' };
    case 'events.completed.v1': return { category: 'events', title: 'Événement terminé', message: eventName ? `« ${eventName} » est maintenant terminé.` : 'Votre événement est maintenant terminé.' };
    case 'guest.import.completed.v1': {
      const imported = Number.isSafeInteger(payload['importedCount']) ? payload['importedCount'] as number : 0;
      const skipped = Number.isSafeInteger(payload['skippedCount']) ? payload['skippedCount'] as number : 0;
      return { category: 'guests', title: 'Import des invités terminé', message: `${imported} invité${imported === 1 ? '' : 's'} importé${imported === 1 ? '' : 's'}${skipped ? `, ${skipped} ligne${skipped === 1 ? '' : 's'} ignorée${skipped === 1 ? '' : 's'}` : ''}.` };
    }
    case 'invitation.rsvp.updated.v1': {
      const responseCount = Number.isSafeInteger(payload['responseCount']) ? payload['responseCount'] as number : 1;
      return { category: 'events', title: 'Réponses RSVP reçues', message: responseCount === 1 ? 'Une réponse à votre invitation vient d’être enregistrée.' : `${responseCount} réponses à vos invitations viennent d’être enregistrées.` };
    }
    case 'payment.succeeded.v1': {
      const credits = Number.isSafeInteger(payload['credits']) ? payload['credits'] as number : null;
      return { category: 'billing', title: 'Paiement confirmé', message: `Votre paiement a été confirmé${credits === null ? '' : ` ; ${credits} crédits ont été ajoutés`}.` };
    }
    case 'payment.failed.v1': return { category: 'billing', title: 'Paiement refusé', message: 'Le prestataire n’a pas confirmé votre paiement. Vous pouvez réessayer depuis votre portefeuille.' };
    case 'payment.refunded.v1': return { category: 'billing', title: 'Paiement remboursé', message: 'Votre remboursement a été confirmé et votre portefeuille a été mis à jour.' };
    default: return null;
  }
}

@Injectable()
export class NotificationsService {
  private readonly directory = new KeycloakDirectory();
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerSubject: string, rawLimit?: string, cursor?: string, unreadOnly = false) {
    const subject = owner(ownerSubject);
    const limit = rawLimit === undefined ? 25 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('La limite doit être comprise entre 1 et 100.');
    if (cursor !== undefined && !uuidPattern.test(cursor)) throw new BadRequestException('Le curseur est invalide.');
    if (cursor) {
      const found = await this.prisma.notification.findFirst({ where: { id: cursor, ownerSubject: subject }, select: { id: true } });
      if (!found) throw new NotFoundException('Notification introuvable.');
    }
    const where = { ownerSubject: subject, ...(unreadOnly ? { readAt: null } : {}) };
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) }),
      this.prisma.notification.count({ where: { ownerSubject: subject, readAt: null } }),
    ]);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return { items, unreadCount, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async markRead(ownerSubject: string, id: string) {
    const subject = owner(ownerSubject);
    if (!uuidPattern.test(id)) throw new BadRequestException('La notification demandée est invalide.');
    const updated = await this.prisma.notification.updateMany({ where: { id, ownerSubject: subject, readAt: null }, data: { readAt: new Date() } });
    if (!updated.count) {
      const existing = await this.prisma.notification.findFirst({ where: { id, ownerSubject: subject } });
      if (!existing) throw new NotFoundException('Notification introuvable.');
      return existing;
    }
    return this.prisma.notification.findFirstOrThrow({ where: { id, ownerSubject: subject } });
  }

  async markAllRead(ownerSubject: string) {
    const subject = owner(ownerSubject);
    const result = await this.prisma.notification.updateMany({ where: { ownerSubject: subject, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  }

  async preferences(ownerSubject: string) {
    const subject = owner(ownerSubject);
    const preference = await this.prisma.notificationPreference.findUnique({ where: { ownerSubject: subject } });
    return { enabled: preference?.enabled ?? true, channels: { inApp: true, email: false } };
  }

  async updatePreferences(ownerSubject: string, body: unknown) {
    const subject = owner(ownerSubject);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Préférences invalides.');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).length !== 1 || typeof input['enabled'] !== 'boolean') throw new BadRequestException('Seule la préférence enabled peut être modifiée.');
    const preference = await this.prisma.notificationPreference.upsert({ where: { ownerSubject: subject }, create: { ownerSubject: subject, enabled: input['enabled'] }, update: { enabled: input['enabled'] } });
    return { enabled: preference.enabled, channels: { inApp: true, email: false } };
  }

  async consume(sourceEventId: string, envelope: EventEnvelope) {
    if (typeof envelope.eventType !== 'string' || !envelope.payload || typeof envelope.payload !== 'object' || Array.isArray(envelope.payload)) return;
    const payload = envelope.payload as Record<string, unknown>;
    if (typeof payload['ownerSubject'] !== 'string' || !ownerPattern.test(payload['ownerSubject'])) return;
    const contentToSave = content(envelope.eventType, payload);
    if (!contentToSave) return;
    let recipientEmail: string | null = null;
    try { recipientEmail = await this.directory.emailForSubject(payload['ownerSubject']); } catch { console.warn(JSON.stringify({ level: 'warn', event: 'notification_recipient_lookup_failed' })); }
    const data: Record<string, string> = {};
    for (const field of ['id', 'eventId', 'paymentId', 'orderId', 'importJobId'] as const) {
      const value = payload[field];
      if (typeof value === 'string' && value.length <= 255) data[field] = value;
    }
    await this.prisma.$transaction(async (tx) => {
      const preference = await tx.notificationPreference.findUnique({ where: { ownerSubject: payload['ownerSubject'] as string } });
      if (preference?.enabled === false) return;
      const notification = await tx.notification.upsert({ where: { sourceEventId }, create: { ownerSubject: payload['ownerSubject'] as string, sourceEventId, eventType: envelope.eventType as string, category: contentToSave.category, title: contentToSave.title, message: contentToSave.message, data: data as Prisma.InputJsonValue }, update: {} });
      if (recipientEmail) await tx.emailDelivery.upsert({ where: { notificationId: notification.id }, create: { notificationId: notification.id, recipientEmail, subject: `InvitaFlow — ${contentToSave.title}`, text: `${contentToSave.message}\n\nRetrouvez cette notification dans votre espace InvitaFlow.` }, update: {} });
    });
  }

  async announce(authorSubject: string, body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Annonce invalide.');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some((key) => key !== 'title' && key !== 'message') || typeof input['title'] !== 'string' || typeof input['message'] !== 'string') throw new BadRequestException('Annonce invalide.');
    const title = input['title'].trim(); const message = input['message'].trim();
    if (title.length < 3 || title.length > 160 || message.length < 3 || message.length > 5_000) throw new BadRequestException('Le titre doit contenir 3 à 160 caractères et le message 3 à 5 000 caractères.');
    const recipients = await this.directory.allVerifiedUsers();
    const announcementId = randomUUID();
    for (let offset = 0; offset < recipients.length; offset += 100) {
      const batch = recipients.slice(offset, offset + 100);
      await this.prisma.$transaction(async (tx) => {
        for (const recipient of batch) {
          const sourceEventId = createHash('sha256').update(`announcement:${announcementId}:${recipient.subject}`).digest('hex');
          const notification = await tx.notification.create({ data: { ownerSubject: recipient.subject, sourceEventId, eventType: 'announcements.sent.v1', category: 'announcement', title, message, data: { announcementId, authorSubject } } });
          await tx.emailDelivery.create({ data: { notificationId: notification.id, recipientEmail: recipient.email, subject: `InvitaFlow — ${title}`, text: `${message}\n\nCette annonce est également disponible dans vos notifications InvitaFlow.` } });
        }
      });
    }
    return { announcementId, recipients: recipients.length, queued: recipients.length };
  }

  sourceFallback(payload: string) { return createHash('sha256').update(payload).digest('hex'); }
}
