import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

const keyPattern = /^[A-Za-z0-9._:-]{1,255}$/;
const packPattern = /^[a-z][a-z0-9-]{1,59}$/;
const operationPattern = /^[a-z][a-z0-9._-]{1,119}$/;
const currencyPattern = /^[A-Z]{3}$/;
type PackInput = { key: string; name: string; credits: number; priceMinor: number; currency: string };
type RuleInput = { operation: string; creditCost: number; unit: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Le corps de la requête est invalide.');
  return value as Record<string, unknown>;
}
function duplicate(error: unknown) { return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002'; }
function positive(value: unknown, label: string, allowZero = false) {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1) || (value as number) > 1_000_000_000) throw new BadRequestException(`${label} est invalide.`);
  return value as number;
}
function text(value: unknown, label: string, maximum: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw new BadRequestException(`${label} est invalide.`);
  return value.trim();
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private current(now = new Date()) {
    return this.prisma.priceSchedule.findFirst({ where: { effectiveAt: { lte: now } }, orderBy: { version: 'desc' }, include: { packs: { orderBy: { credits: 'asc' } }, rules: { orderBy: { operation: 'asc' } } } });
  }

  async catalog() {
    const schedule = await this.current();
    if (!schedule) throw new NotFoundException('Aucune grille tarifaire n’est actuellement publiée.');
    return { scheduleId: schedule.id, version: schedule.version, effectiveAt: schedule.effectiveAt, packs: schedule.packs.map(({ id, key, name, credits, priceMinor, currency }) => ({ id, key, name, credits, priceMinor, currency })), rules: schedule.rules.map(({ operation, creditCost, unit }) => ({ operation, creditCost, unit })) };
  }

  async quote(body: unknown) {
    const input = object(body);
    if (Object.keys(input).some((key) => !['operation', 'quantity'].includes(key))) throw new BadRequestException('Champs de devis non autorisés.');
    const operation = text(input['operation'], 'L’opération', 120);
    if (!operationPattern.test(operation)) throw new BadRequestException('L’opération est invalide.');
    const quantity = positive(input['quantity'], 'La quantité');
    const schedule = await this.current();
    if (!schedule) throw new NotFoundException('Aucune grille tarifaire n’est actuellement publiée.');
    const rule = schedule.rules.find((entry) => entry.operation === operation);
    if (!rule) throw new NotFoundException('Cette opération ne figure pas dans la grille tarifaire.');
    const creditTotal = rule.creditCost * quantity;
    if (!Number.isSafeInteger(creditTotal)) throw new BadRequestException('Le total du devis est trop élevé.');
    return { scheduleId: schedule.id, scheduleVersion: schedule.version, effectiveAt: schedule.effectiveAt, operation, quantity, unit: rule.unit, unitCreditCost: rule.creditCost, creditTotal };
  }

  async createSchedule(createdBy: string, rawKey: string, body: unknown) {
    if (typeof createdBy !== 'string' || !createdBy || createdBy.length > 255) throw new BadRequestException('Identité administrateur invalide.');
    if (typeof rawKey !== 'string' || !keyPattern.test(rawKey)) throw new BadRequestException('La clé Idempotency-Key est obligatoire et invalide.');
    const input = object(body);
    if (Object.keys(input).some((key) => !['effectiveAt', 'packs', 'rules'].includes(key))) throw new BadRequestException('Champs de grille tarifaire non autorisés.');
    const rawEffectiveAt = input['effectiveAt'];
    if (typeof rawEffectiveAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(rawEffectiveAt)) throw new BadRequestException('La date de prise d’effet doit être une date ISO UTC.');
    const effectiveAt = new Date(rawEffectiveAt);
    if (!Number.isFinite(effectiveAt.getTime()) || effectiveAt <= new Date(Date.now() + 60_000)) throw new BadRequestException('La grille doit prendre effet au moins une minute dans le futur.');
    if (!Array.isArray(input['packs']) || input['packs'].length < 1 || input['packs'].length > 50) throw new BadRequestException('La grille doit contenir entre 1 et 50 packs.');
    if (!Array.isArray(input['rules']) || input['rules'].length < 1 || input['rules'].length > 100) throw new BadRequestException('La grille doit contenir entre 1 et 100 règles.');
    const packs = (input['packs'] as unknown[]).map((raw): PackInput => {
      const value = object(raw);
      if (Object.keys(value).some((key) => !['key', 'name', 'credits', 'priceMinor', 'currency'].includes(key))) throw new BadRequestException('Champs de pack non autorisés.');
      const key = text(value['key'], 'La clé du pack', 60);
      const currency = text(value['currency'], 'La devise', 3);
      if (!packPattern.test(key) || !currencyPattern.test(currency)) throw new BadRequestException('La clé ou la devise du pack est invalide.');
      return { key, name: text(value['name'], 'Le nom du pack', 100), credits: positive(value['credits'], 'Les crédits du pack'), priceMinor: positive(value['priceMinor'], 'Le prix en unité mineure'), currency };
    });
    const rules = (input['rules'] as unknown[]).map((raw): RuleInput => {
      const value = object(raw);
      if (Object.keys(value).some((key) => !['operation', 'creditCost', 'unit'].includes(key))) throw new BadRequestException('Champs de règle non autorisés.');
      const operation = text(value['operation'], 'L’opération', 120);
      if (!operationPattern.test(operation)) throw new BadRequestException('L’opération de tarification est invalide.');
      return { operation, creditCost: positive(value['creditCost'], 'Le coût en crédits', true), unit: text(value['unit'], 'L’unité', 60) };
    });
    if (new Set(packs.map((pack) => pack.key)).size !== packs.length || new Set(rules.map((rule) => rule.operation)).size !== rules.length) throw new BadRequestException('Les clés de packs et opérations doivent être uniques.');
    if (!rules.some((rule) => rule.operation === 'invitation.preview' && rule.creditCost === 0) || !rules.some((rule) => rule.operation === 'invitation.test' && rule.creditCost === 0)) throw new BadRequestException('Les aperçus et tests doivent rester gratuits.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(7192017)`);
        const existing = await tx.priceSchedule.findUnique({ where: { idempotencyKey: rawKey }, include: { packs: true, rules: true } });
        if (existing) {
          if (existing.createdBy !== createdBy || existing.effectiveAt.getTime() !== effectiveAt.getTime()) throw new ConflictException('La clé d’idempotence a déjà été utilisée.');
          return existing;
        }
        const last = await tx.priceSchedule.aggregate({ _max: { version: true } });
        const latest = await tx.priceSchedule.findFirst({ orderBy: { effectiveAt: 'desc' }, select: { effectiveAt: true } });
        if (latest && effectiveAt <= latest.effectiveAt) throw new BadRequestException('La prise d’effet doit suivre la dernière grille planifiée.');
        const version = (last._max.version ?? 0) + 1;
        const schedule = await tx.priceSchedule.create({ data: {
          version, effectiveAt, createdBy, idempotencyKey: rawKey,
          packs: { create: packs }, rules: { create: rules },
        } });
        await tx.outboxMessage.create({ data: { eventType: 'billing.price-schedule-published.v1', aggregateId: schedule.id, payload: { scheduleId: schedule.id, version, effectiveAt, createdBy } } });
        return tx.priceSchedule.findUniqueOrThrow({ where: { id: schedule.id }, include: { packs: true, rules: true } });
      });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
      if (!duplicate(error)) throw error;
      const prior = await this.prisma.priceSchedule.findUnique({ where: { idempotencyKey: rawKey }, include: { packs: true, rules: true } });
      if (prior && prior.createdBy === createdBy && prior.effectiveAt.getTime() === effectiveAt.getTime()) return prior;
      throw new ConflictException('La grille ou sa clé d’idempotence existe déjà.');
    }
  }
}
