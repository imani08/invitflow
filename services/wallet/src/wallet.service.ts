import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReservationStatus, WalletEntryType } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

const subjectPattern = /^[\p{L}\p{N}._:@-]{1,255}$/u;
const referencePattern = /^[A-Za-z0-9._:@/-]{1,255}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type FinalStatus = 'CONSUMED' | 'RELEASED';
const CREDIT_ENTRY_TYPES: WalletEntryType[] = [WalletEntryType.PURCHASE, WalletEntryType.PROMO, WalletEntryType.ADMIN_ADJUSTMENT];

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Le corps de la requête est invalide.');
  return value as Record<string, unknown>;
}
function positiveCredits(value: unknown) {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1_000_000) throw new BadRequestException('Le nombre de crédits doit être un entier positif valide.');
  return value as number;
}
function validKey(value: unknown) {
  if (typeof value !== 'string' || !referencePattern.test(value)) throw new BadRequestException('La clé Idempotency-Key est obligatoire et invalide.');
  return value;
}
function validOwner(value: string) {
  if (!subjectPattern.test(value)) throw new BadRequestException('Le propriétaire du portefeuille est invalide.');
  return value;
}
function validReference(value: unknown) {
  if (typeof value !== 'string' || !referencePattern.test(value)) throw new BadRequestException('La référence est invalide.');
  return value;
}
function sameConflict(error: unknown) { return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002'; }

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  private async getWallet(ownerSubject: string) {
    return this.prisma.wallet.upsert({ where: { ownerSubject: validOwner(ownerSubject) }, create: { ownerSubject }, update: {} });
  }
  private async ensureWallet(tx: Prisma.TransactionClient, ownerSubject: string) {
    return tx.wallet.upsert({ where: { ownerSubject: validOwner(ownerSubject) }, create: { ownerSubject }, update: {} });
  }
  private async append(tx: Prisma.TransactionClient, walletId: string, type: WalletEntryType, availableDelta: number, reservedDelta: number, key: string, referenceType: string, referenceId: string, reversalOfEntryId?: string) {
    return tx.walletEntry.create({ data: { walletId, type, availableDelta, reservedDelta, idempotencyKey: key, referenceType, referenceId, ...(reversalOfEntryId ? { reversalOfEntryId } : {}) } });
  }
  private async apply(tx: Prisma.TransactionClient, walletId: string, availableDelta: number, reservedDelta: number) {
    const updated = await tx.wallet.updateMany({
      where: { id: walletId, ...(availableDelta < 0 ? { availableCredits: { gte: -availableDelta } } : {}), ...(reservedDelta < 0 ? { reservedCredits: { gte: -reservedDelta } } : {}) },
      data: { availableCredits: { increment: availableDelta }, reservedCredits: { increment: reservedDelta } },
    });
    if (!updated.count) throw new ConflictException('Le solde disponible ne permet pas cette opération.');
  }
  private async publish(tx: Prisma.TransactionClient, eventType: string, walletId: string, ownerSubject: string, entryId: string, availableDelta: number, reservedDelta: number, referenceId: string) {
    await tx.outboxMessage.create({ data: { eventType, aggregateId: walletId, payload: { walletId, ownerSubject, entryId, availableDelta, reservedDelta, referenceId } } });
  }
  private async summary(ownerSubject: string) {
    const wallet = await this.getWallet(ownerSubject);
    return { walletId: wallet.id, availableCredits: wallet.availableCredits, reservedCredits: wallet.reservedCredits, totalCredits: wallet.availableCredits + wallet.reservedCredits, currency: 'CREDITS', updatedAt: wallet.updatedAt };
  }

  balance(ownerSubject: string) { return this.summary(ownerSubject); }

  async transactions(ownerSubject: string, cursor?: string, rawLimit?: string) {
    const wallet = await this.getWallet(ownerSubject);
    const limit = rawLimit === undefined ? 25 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('La limite doit être comprise entre 1 et 100.');
    if (cursor !== undefined && !uuidPattern.test(cursor)) throw new BadRequestException('Le curseur est invalide.');
    const rows = await this.prisma.walletEntry.findMany({ where: { walletId: wallet.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), take: limit + 1, select: { id: true, type: true, availableDelta: true, reservedDelta: true, referenceType: true, referenceId: true, reversalOfEntryId: true, createdAt: true } });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
  }

  async credit(owner: string, rawKey: string, body: unknown) {
    const ownerSubject = validOwner(owner); const key = validKey(rawKey); const input = record(body);
    if (Object.keys(input).some((name) => !['credits', 'type', 'referenceId'].includes(name))) throw new BadRequestException('Champs de crédit non autorisés.');
    const credits = positiveCredits(input['credits']);
    const type = input['type'];
    if (!['PURCHASE', 'PROMO', 'ADMIN_ADJUSTMENT'].includes(String(type))) throw new BadRequestException('Le type de crédit est invalide.');
    const creditType = type as 'PURCHASE' | 'PROMO' | 'ADMIN_ADJUSTMENT';
    const referenceId = validReference(input['referenceId']);
    const entryType = type as WalletEntryType;
    try {
      await this.prisma.$transaction(async (tx) => {
        const wallet = await this.ensureWallet(tx, ownerSubject);
        const existing = await tx.walletEntry.findUnique({ where: { idempotencyKey: key } });
        if (existing) {
          if (existing.walletId !== wallet.id || existing.type !== entryType || existing.availableDelta !== credits || existing.referenceId !== referenceId) throw new ConflictException('La clé d’idempotence a déjà été utilisée pour une autre opération.');
          return;
        }
        await this.apply(tx, wallet.id, credits, 0);
        const entry = await this.append(tx, wallet.id, entryType, credits, 0, key, creditType === 'PURCHASE' ? 'PAYMENT' : creditType, referenceId);
        await this.publish(tx, creditType === 'PURCHASE' ? 'wallet.credited.v1' : creditType === 'PROMO' ? 'wallet.promo-credited.v1' : 'wallet.adjusted.v1', wallet.id, ownerSubject, entry.id, credits, 0, referenceId);
      });
    } catch (error) {
      if (!sameConflict(error)) throw error;
      const existing = await this.prisma.walletEntry.findUnique({ where: { idempotencyKey: key }, include: { wallet: true } });
      if (!existing || existing.wallet.ownerSubject !== ownerSubject || existing.type !== entryType || existing.availableDelta !== credits || existing.referenceId !== referenceId) throw new ConflictException('La clé ou référence financière existe déjà.');
    }
    return this.summary(ownerSubject);
  }

  async reserve(owner: string, rawKey: string, body: unknown) {
    const ownerSubject = validOwner(owner); const key = validKey(rawKey); const input = record(body);
    if (Object.keys(input).some((name) => !['credits', 'referenceId'].includes(name))) throw new BadRequestException('Champs de réservation non autorisés.');
    const credits = positiveCredits(input['credits']); const referenceId = validReference(input['referenceId']);
    try {
      await this.prisma.$transaction(async (tx) => {
        const wallet = await this.ensureWallet(tx, ownerSubject);
        const previous = await tx.walletReservation.findUnique({ where: { walletId_referenceId: { walletId: wallet.id, referenceId } } });
        if (previous) {
          if (previous.credits !== credits) throw new ConflictException('Cette référence est déjà réservée pour un autre montant.');
          return;
        }
        const usedKey = await tx.walletEntry.findUnique({ where: { idempotencyKey: key } });
        if (usedKey) throw new ConflictException('La clé d’idempotence a déjà été utilisée.');
        await this.apply(tx, wallet.id, -credits, credits);
        const reservation = await tx.walletReservation.create({ data: { walletId: wallet.id, referenceId, credits, idempotencyKey: key } });
        const entry = await this.append(tx, wallet.id, WalletEntryType.RESERVATION, -credits, credits, key, 'RESERVATION', referenceId);
        await this.publish(tx, 'credits.reserved.v1', wallet.id, ownerSubject, entry.id, -credits, credits, reservation.referenceId);
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if (!sameConflict(error)) throw error;
      const wallet = await this.getWallet(ownerSubject);
      const prior = await this.prisma.walletReservation.findUnique({ where: { walletId_referenceId: { walletId: wallet.id, referenceId } } });
      if (!prior || prior.credits !== credits) throw new ConflictException('La clé ou référence de réservation existe déjà.');
    }
    const wallet = await this.getWallet(ownerSubject);
    const reservation = await this.prisma.walletReservation.findUniqueOrThrow({ where: { walletId_referenceId: { walletId: wallet.id, referenceId } } });
    return { ...reservation, ...(await this.summary(ownerSubject)) };
  }

  async finalizeReservation(owner: string, rawReference: string, rawKey: string, finalStatus: FinalStatus) {
    const ownerSubject = validOwner(owner); const referenceId = validReference(rawReference); const key = validKey(rawKey);
    const final = finalStatus === 'CONSUMED' ? ReservationStatus.CONSUMED : ReservationStatus.RELEASED;
    const type = finalStatus === 'CONSUMED' ? WalletEntryType.CONSUMPTION : WalletEntryType.RELEASE;
    const eventType = finalStatus === 'CONSUMED' ? 'credits.consumed.v1' : 'credits.released.v1';
    const wallet = await this.getWallet(ownerSubject);
    const result = await this.prisma.$transaction(async (tx) => {
      const prior = await tx.walletEntry.findUnique({ where: { idempotencyKey: key } });
      if (prior) {
        if (prior.walletId !== wallet.id || prior.referenceId !== referenceId || prior.type !== type) throw new ConflictException('La clé d’idempotence a déjà été utilisée pour une autre opération.');
        return tx.walletReservation.findUniqueOrThrow({ where: { walletId_referenceId: { walletId: wallet.id, referenceId } } });
      }
      const reservation = await tx.walletReservation.findUnique({ where: { walletId_referenceId: { walletId: wallet.id, referenceId } } });
      if (!reservation) throw new NotFoundException('Réservation de crédits introuvable.');
      if (reservation.status !== ReservationStatus.RESERVED) throw new ConflictException('Cette réservation a déjà été finalisée.');
      const updated = await tx.walletReservation.updateMany({ where: { id: reservation.id, status: ReservationStatus.RESERVED }, data: { status: final, completedAt: new Date() } });
      if (!updated.count) throw new ConflictException('Cette réservation a déjà été finalisée.');
      const availableDelta = finalStatus === 'RELEASED' ? reservation.credits : 0;
      const reservedDelta = -reservation.credits;
      await this.apply(tx, wallet.id, availableDelta, reservedDelta);
      const entry = await this.append(tx, wallet.id, type, availableDelta, reservedDelta, key, 'RESERVATION', referenceId);
      await this.publish(tx, eventType, wallet.id, ownerSubject, entry.id, availableDelta, reservedDelta, referenceId);
      return tx.walletReservation.findUniqueOrThrow({ where: { id: reservation.id } });
    });
    return { ...result, ...(await this.summary(ownerSubject)) };
  }

  async settleReservation(owner: string, rawReference: string, rawKey: string, body: unknown) {
    const ownerSubject = validOwner(owner); const referenceId = validReference(rawReference); const key = validKey(rawKey); const input = record(body);
    if (Object.keys(input).some((name) => name !== 'consumedCredits')) throw new BadRequestException('Champs de règlement non autorisés.');
    const consumedCredits = input['consumedCredits'];
    if (!Number.isSafeInteger(consumedCredits) || (consumedCredits as number) < 0) throw new BadRequestException('Le nombre de crédits consommés est invalide.');
    const wallet = await this.getWallet(ownerSubject);
    const result = await this.prisma.$transaction(async (tx) => {
      const prior = await tx.walletEntry.findUnique({ where: { idempotencyKey: key } });
      if (prior) {
        const metadata = prior.metadata && typeof prior.metadata === 'object' && !Array.isArray(prior.metadata) ? prior.metadata as Prisma.JsonObject : null;
        if (prior.walletId !== wallet.id || prior.referenceId !== referenceId || prior.type !== WalletEntryType.SETTLEMENT || metadata?.['consumedCredits'] !== consumedCredits) throw new ConflictException('La clé d’idempotence a déjà été utilisée pour une autre opération.');
        return tx.walletReservation.findUniqueOrThrow({ where: { walletId_referenceId: { walletId: wallet.id, referenceId } } });
      }
      const reservation = await tx.walletReservation.findUnique({ where: { walletId_referenceId: { walletId: wallet.id, referenceId } } });
      if (!reservation) throw new NotFoundException('Réservation de crédits introuvable.');
      if ((consumedCredits as number) > reservation.credits) throw new BadRequestException('Le montant consommé dépasse la réservation.');
      if (reservation.status !== ReservationStatus.RESERVED) throw new ConflictException('Cette réservation a déjà été finalisée.');
      const updated = await tx.walletReservation.updateMany({ where: { id: reservation.id, status: ReservationStatus.RESERVED }, data: { status: ReservationStatus.CONSUMED, completedAt: new Date() } });
      if (!updated.count) throw new ConflictException('Cette réservation a déjà été finalisée.');
      const consumed = consumedCredits as number; const availableDelta = reservation.credits - consumed; const reservedDelta = -reservation.credits;
      await this.apply(tx, wallet.id, availableDelta, reservedDelta);
      const entry = await tx.walletEntry.create({ data: { walletId: wallet.id, type: WalletEntryType.SETTLEMENT, availableDelta, reservedDelta, idempotencyKey: key, referenceType: 'RESERVATION', referenceId, metadata: { consumedCredits: consumed, releasedCredits: availableDelta } } });
      await this.publish(tx, 'credits.settled.v1', wallet.id, ownerSubject, entry.id, availableDelta, reservedDelta, referenceId);
      return tx.walletReservation.findUniqueOrThrow({ where: { id: reservation.id } });
    });
    return { ...result, ...(await this.summary(ownerSubject)) };
  }

  async reverse(owner: string, rawEntryId: string, rawKey: string) {
    const ownerSubject = validOwner(owner); const key = validKey(rawKey); const entryId = rawEntryId;
    if (!uuidPattern.test(entryId)) throw new BadRequestException('La référence de transaction est invalide.');
    const wallet = await this.getWallet(ownerSubject);
    try {
      await this.prisma.$transaction(async (tx) => {
        const original = await tx.walletEntry.findFirst({ where: { id: entryId, walletId: wallet.id } });
        if (!original) throw new NotFoundException('Transaction introuvable.');
        if (!CREDIT_ENTRY_TYPES.includes(original.type)) throw new ConflictException('Seules les entrées de crédit peuvent être corrigées. Les réservations et consommations suivent leur propre workflow.');
        const existing = await tx.walletEntry.findUnique({ where: { reversalOfEntryId: original.id } });
        if (existing) return;
        const usedKey = await tx.walletEntry.findUnique({ where: { idempotencyKey: key } });
        if (usedKey) throw new ConflictException('La clé d’idempotence a déjà été utilisée.');
        const availableDelta = -original.availableDelta; const reservedDelta = -original.reservedDelta;
        await this.apply(tx, wallet.id, availableDelta, reservedDelta);
        const reversal = await this.append(tx, wallet.id, WalletEntryType.REVERSAL, availableDelta, reservedDelta, key, 'REVERSAL', original.id, original.id);
        await this.publish(tx, 'wallet.reversed.v1', wallet.id, ownerSubject, reversal.id, availableDelta, reservedDelta, original.id);
      });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException) throw error;
      if (!sameConflict(error)) throw error;
      const reversal = await this.prisma.walletEntry.findUnique({ where: { reversalOfEntryId: entryId } });
      if (!reversal || reversal.walletId !== wallet.id) throw new ConflictException('La transaction a déjà été corrigée.');
    }
    return this.summary(ownerSubject);
  }

  async reversePurchase(owner: string, rawPaymentId: string, rawKey: string) {
    const ownerSubject = validOwner(owner); const paymentId = validReference(rawPaymentId);
    const wallet = await this.getWallet(ownerSubject);
    const purchase = await this.prisma.walletEntry.findFirst({ where: { walletId: wallet.id, type: WalletEntryType.PURCHASE, referenceType: 'PAYMENT', referenceId: paymentId }, orderBy: { createdAt: 'asc' } });
    if (!purchase) throw new NotFoundException('Crédit d’achat introuvable pour ce paiement.');
    return this.reverse(ownerSubject, purchase.id, rawKey);
  }
}
