import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma/client.js';
import { KeycloakDirectory } from './keycloak-directory.js';
import { buildNotificationContent, type NotificationContent } from './notifications-content.js';
import { PrismaService } from './prisma.service.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ownerPattern = /^[^\u0000-\u001f\u007f]{1,255}$/;
type EventEnvelope = { eventId?: unknown; eventType?: unknown; payload?: unknown };

function emailText(content: NotificationContent, data: Record<string, string>) {
  const actionUrl = data['actionUrl'];
  const actionLabel = data['actionLabel'] ?? 'Ouvrir';
  const publicWebUrl = (process.env['PUBLIC_WEB_URL'] ?? 'http://localhost:3000').replace(/\/$/, '');
  const actionLine = actionUrl ? `\n\nAction recommandée : ${actionLabel}\n${publicWebUrl}${actionUrl}` : '';
  return `${content.message}${actionLine}\n\nRetrouvez cette notification dans votre espace InvitaFlow.`;
}

function owner(value: string) {
  if (!ownerPattern.test(value)) throw new BadRequestException('Identité invalide.');
  return value;
}

function legacyContent(eventType: string, payload: Record<string, unknown>): NotificationContent | null {
  const eventName = typeof payload['name'] === 'string' ? payload['name'].trim().slice(0, 120) : '';
  const agency = typeof payload['agencyWorkspaceId'] === 'string' && payload['agencyWorkspaceId'].length > 0;
  const ceremonyName = typeof payload['ceremonyName'] === 'string' ? payload['ceremonyName'].trim().slice(0, 120) : '';
  switch (eventType) {
    case 'agencies.workspace.created.v1': return { category: 'agency', title: 'Espace agence créé', message: 'Votre espace agence est prêt. Vous pouvez ajouter des clients et créer leurs événements.' };
    case 'agencies.quota.reserved.v1': return { category: 'agency', title: 'Quota agence réservé', message: `${Number.isSafeInteger(payload['credits']) ? payload['credits'] : 'Des'} crédit${payload['credits'] === 1 ? '' : 's'} a été réservé${payload['credits'] === 1 ? '' : 's'} pour une génération d’invitations.` };
    case 'events.created.v1': return { category: agency ? 'agency' : 'events', title: agency ? 'Événement client créé' : 'Événement créé', message: eventName ? `« ${eventName} » a été créé${agency ? ' dans votre agence' : ''}.` : 'Un nouvel événement a été créé dans votre espace.' };
    case 'events.updated.v1': return { category: agency ? 'agency' : 'events', title: 'Événement mis à jour', message: eventName ? `Les informations de « ${eventName} » ont été enregistrées.` : 'Les informations de votre événement ont été mises à jour.' };
    case 'events.published.v1': return { category: 'events', title: 'Événement publié', message: eventName ? `« ${eventName} » est maintenant publié.` : 'Votre événement est maintenant publié.' };
    case 'events.cancelled.v1': return { category: 'events', title: 'Événement annulé', message: eventName ? `« ${eventName} » a été annulé.` : 'Un de vos événements a été annulé.' };
    case 'events.completed.v1': return { category: 'events', title: 'Événement terminé', message: eventName ? `« ${eventName} » est maintenant terminé.` : 'Votre événement est maintenant terminé.' };
    case 'events.ceremony.created.v1': return { category: 'events', title: 'Moment ajouté au programme', message: ceremonyName ? `« ${ceremonyName} » a été ajouté à votre programme.` : 'Un moment a été ajouté au programme de votre événement.' };
    case 'events.ceremony.updated.v1': return { category: 'events', title: 'Moment mis à jour', message: ceremonyName ? `Les informations de « ${ceremonyName} » ont été enregistrées.` : 'Un moment de votre programme a été mis à jour.' };
    case 'events.ceremony.deleted.v1': return { category: 'events', title: 'Moment retiré du programme', message: 'Un moment a été retiré du programme. Les autres données de l’événement restent conservées.' };
    case 'events.ceremony.program-item.created.v1': return { category: 'events', title: 'Étape de programme ajoutée', message: 'Une étape a été ajoutée au déroulement d’un moment.' };
    case 'events.ceremony.program-item.updated.v1': return { category: 'events', title: 'Étape de programme mise à jour', message: 'Une étape du déroulement a été modifiée.' };
    case 'events.ceremony.program-item.deleted.v1': return { category: 'events', title: 'Étape de programme supprimée', message: 'Une étape du déroulement a été supprimée.' };
    case 'events.ceremony.program-reordered.v1': return { category: 'events', title: 'Déroulement réorganisé', message: 'L’ordre des étapes de votre programme a été enregistré.' };
    case 'design.created.v1': return { category: 'design', title: 'Design créé', message: 'Votre nouveau design est prêt à être personnalisé.' };
    case 'design.updated.v1': return { category: 'design', title: 'Design enregistré', message: 'Les modifications de votre design ont été enregistrées.' };
    case 'design.editorial.selected.v1': return { category: 'design', title: 'Design validé', message: 'Votre design sélectionné est prêt pour la génération.' };
    case 'design.archived.v1': return { category: 'design', title: 'Design archivé', message: 'Un design a été archivé. Vos autres créations restent disponibles.' };
    case 'guest.import.completed.v1': {
      const imported = Number.isSafeInteger(payload['importedCount']) ? payload['importedCount'] as number : 0;
      const skipped = Number.isSafeInteger(payload['skippedCount']) ? payload['skippedCount'] as number : 0;
      return { category: 'guests', title: 'Import des invités terminé', message: `${imported} invité${imported === 1 ? '' : 's'} importé${imported === 1 ? '' : 's'}${skipped ? `, ${skipped} ligne${skipped === 1 ? '' : 's'} ignorée${skipped === 1 ? '' : 's'}` : ''}.` };
    }
    case 'guest.created.v1': return { category: 'guests', title: 'Invité ajouté', message: 'Un invité a été ajouté à votre liste.' };
    case 'guest.updated.v1': return { category: 'guests', title: 'Invité mis à jour', message: 'Les informations d’un invité ont été enregistrées.' };
    case 'guest.archived.v1': return { category: 'guests', title: 'Invité archivé', message: 'Un invité a été retiré de la liste active.' };
    case 'guest.ceremony-access.updated.v1': return { category: 'guests', title: 'Accès à un moment mis à jour', message: 'Les autorisations d’un invité ont été modifiées.' };
    case 'invitation.batch.completed.v1': return { category: 'events', title: 'Invitations générées', message: `${Number.isSafeInteger(payload['generatedCount']) ? payload['generatedCount'] : 'Les'} invitation${payload['generatedCount'] === 1 ? '' : 's'} est${payload['generatedCount'] === 1 ? '' : 'ont'} prête${payload['generatedCount'] === 1 ? '' : 's'} au téléchargement.` };
    case 'invitation.batch.failed.v1': return { category: 'events', title: 'Génération à vérifier', message: 'La génération des invitations nécessite votre attention. Consultez le détail du lot.' };
    case 'invitation.checkin.created.v1': return { category: 'events', title: 'Pointage enregistré', message: 'Un invité a été pointé à l’accueil.' };
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
    case 'payment.reconciliation-anomaly.v1': return { category: 'billing', title: 'Paiement à vérifier', message: 'Une anomalie de rapprochement a été détectée. Consultez votre historique de paiements.' };
    case 'payment.reconciliation-resolved.v1': return { category: 'billing', title: 'Paiement vérifié', message: 'Une anomalie de paiement a été résolue.' };
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
    return { enabled: preference?.enabled ?? true, channels: { inApp: true, email: true } };
  }

  async updatePreferences(ownerSubject: string, body: unknown) {
    const subject = owner(ownerSubject);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Préférences invalides.');
    const input = body as Record<string, unknown>;
    if (Object.keys(input).length !== 1 || typeof input['enabled'] !== 'boolean') throw new BadRequestException('Seule la préférence enabled peut être modifiée.');
    const preference = await this.prisma.notificationPreference.upsert({ where: { ownerSubject: subject }, create: { ownerSubject: subject, enabled: input['enabled'] }, update: { enabled: input['enabled'] } });
    return { enabled: preference.enabled, channels: { inApp: true, email: true } };
  }

  async consume(sourceEventId: string, envelope: EventEnvelope) {
    if (typeof envelope.eventType !== 'string' || !envelope.payload || typeof envelope.payload !== 'object' || Array.isArray(envelope.payload)) return;
    const payload = envelope.payload as Record<string, unknown>;
    const recipientSubject = typeof payload['ownerSubject'] === 'string' ? payload['ownerSubject'] : typeof payload['identitySubject'] === 'string' ? payload['identitySubject'] : '';
    if (!ownerPattern.test(recipientSubject)) return;
    const contentToSave = buildNotificationContent(envelope.eventType, payload) ?? legacyContent(envelope.eventType, payload);
    if (!contentToSave) return;
    let recipientEmail: string | null = null;
    try { recipientEmail = await this.directory.emailForSubject(recipientSubject); } catch { console.warn(JSON.stringify({ level: 'warn', event: 'notification_recipient_lookup_failed' })); }
    const data: Record<string, string> = {};
    for (const field of ['id', 'eventId', 'paymentId', 'orderId', 'importJobId', 'requestId', 'ceremonyId', 'designId', 'guestId', 'batchId', 'workspaceId', 'walletId', 'entryId', 'referenceId'] as const) {
      const value = payload[field];
      if (typeof value === 'string' && value.length <= 255) data[field] = value;
    }
    if (contentToSave?.data) Object.assign(data, contentToSave.data);
    await this.prisma.$transaction(async (tx) => {
      const preference = await tx.notificationPreference.findUnique({ where: { ownerSubject: recipientSubject } });
      if (preference?.enabled === false) return;
      const notification = await tx.notification.upsert({ where: { sourceEventId }, create: { ownerSubject: recipientSubject, sourceEventId, eventType: envelope.eventType as string, category: contentToSave.category, title: contentToSave.title, message: contentToSave.message, data: data as Prisma.InputJsonValue }, update: {} });
      if (recipientEmail) await tx.emailDelivery.upsert({ where: { notificationId: notification.id }, create: { notificationId: notification.id, recipientEmail, subject: `InvitaFlow — ${contentToSave.title}`, text: emailText(contentToSave, data) }, update: {} });
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
