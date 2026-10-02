import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

const keyPattern = /^[A-Za-z0-9._:-]{1,255}$/;
const packPattern = /^[a-z][a-z0-9-]{1,59}$/;
const operationPattern = /^[a-z][a-z0-9._-]{1,119}$/;
const currencyPattern = /^[A-Z]{3}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type PackInput = {
  key: string; name: string; credits: number; priceMinor: number; currency: string;
  description: string; segment: string; displayOrder: number; badge: string | null;
  validFrom: Date | null; validUntil: Date | null; visible: boolean;
};
type RuleInput = { operation: string; creditCost: number; unit: string };
type TaxPolicy = { enabled: boolean; ruleCode: string | null; rateBps: number };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Le corps de la requête est invalide.');
  return value as Record<string, unknown>;
}
function duplicate(error: unknown) { return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002'; }
function sameScheduleDefinition(existing: { packs: PackInput[]; rules: RuleInput[] }, packs: PackInput[], rules: RuleInput[]) {
  const packFields = (items: PackInput[]) => [...items]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ key, name, credits, priceMinor, currency, description, segment, displayOrder, badge, validFrom, validUntil, visible }) => ({ key, name, credits, priceMinor, currency, description, segment, displayOrder, badge, validFrom, validUntil, visible }));
  const ruleFields = (items: RuleInput[]) => [...items]
    .sort((a, b) => (a.operation < b.operation ? -1 : a.operation > b.operation ? 1 : 0))
    .map(({ operation, creditCost, unit }) => ({ operation, creditCost, unit }));
  return JSON.stringify({ packs: packFields(existing.packs), rules: ruleFields(existing.rules) }) ===
    JSON.stringify({ packs: packFields(packs), rules: ruleFields(rules) });
}
function sameTaxPolicy(existing: { taxPolicyEnabled: boolean; taxRuleCode: string | null; taxRateBps: number }, taxPolicy: TaxPolicy) {
  return existing.taxPolicyEnabled === taxPolicy.enabled && existing.taxRuleCode === taxPolicy.ruleCode && existing.taxRateBps === taxPolicy.rateBps;
}
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

  async catalog(rawSegment?: string) {
    const schedule = await this.current();
    if (!schedule) throw new NotFoundException('Aucune grille tarifaire n’est actuellement publiée.');
    const segment = rawSegment ?? 'INDIVIDUAL';
    if (!['INDIVIDUAL', 'AGENCY'].includes(segment)) throw new BadRequestException('Segment tarifaire invalide.');
    const now = new Date();
    const packs = schedule.packs
      .filter((pack) => pack.visible && (pack.segment === segment || pack.segment === 'ALL') && (!pack.validFrom || pack.validFrom <= now) && (!pack.validUntil || pack.validUntil > now))
      .sort((a, b) => a.displayOrder - b.displayOrder || a.credits - b.credits)
      .map(({ id, key, name, credits, priceMinor, currency, description, segment, displayOrder, badge, validFrom, validUntil }) => ({ id, key, name, credits, priceMinor, currency, description, segment, displayOrder, badge, validFrom, validUntil }));
    return { scheduleId: schedule.id, version: schedule.version, effectiveAt: schedule.effectiveAt, taxPolicy: { enabled: schedule.taxPolicyEnabled, ruleCode: schedule.taxRuleCode, rateBps: schedule.taxRateBps }, packs, rules: schedule.rules.map(({ operation, creditCost, unit }) => ({ operation, creditCost, unit })) };
  }

  async adminCatalog() {
    const schedule = await this.prisma.priceSchedule.findFirst({
      orderBy: { version: 'desc' },
      include: { packs: { orderBy: [{ displayOrder: 'asc' }, { credits: 'asc' }] }, rules: { orderBy: { operation: 'asc' } } },
    });
    if (!schedule) throw new NotFoundException('Aucune grille tarifaire n’est publiée.');
    return { scheduleId: schedule.id, version: schedule.version, effectiveAt: schedule.effectiveAt, changeReason: schedule.changeReason, taxPolicy: { enabled: schedule.taxPolicyEnabled, ruleCode: schedule.taxRuleCode, rateBps: schedule.taxRateBps }, packs: schedule.packs, rules: schedule.rules };
  }

  async checkoutQuote(body: unknown) {
    const input = object(body);
    if (Object.keys(input).some((key) => !['packId', 'quantity', 'orderType'].includes(key))) throw new BadRequestException('Champs de commande non autorisés.');
    const orderType = input['orderType'] ?? 'CREDIT_PURCHASE';
    if (orderType !== 'CREDIT_PURCHASE' && orderType !== 'AGENCY_SUBSCRIPTION') throw new BadRequestException('Le type de commande est invalide.');
    if (typeof input['packId'] !== 'string' || !uuidPattern.test(input['packId'])) throw new BadRequestException('Le pack demandé est invalide.');
    const quantity = input['quantity'] === undefined ? 1 : positive(input['quantity'], 'La quantité');
    if (quantity > 100) throw new BadRequestException('La quantité maximale par commande est 100.');
    const schedule = await this.current();
    if (!schedule) throw new NotFoundException('Aucune grille tarifaire n’est actuellement publiée.');
    const now = new Date();
    const pack = schedule.packs.find((item) => item.id === input['packId'] && item.visible && (orderType === 'AGENCY_SUBSCRIPTION' ? item.segment === 'AGENCY' : item.segment !== 'AGENCY') && (!item.validFrom || item.validFrom <= now) && (!item.validUntil || item.validUntil > now));
    if (!pack) throw new NotFoundException('Ce pack n’est plus disponible dans la grille tarifaire active.');
    const unitCredits = pack.credits;
    const unitPriceMinor = pack.priceMinor;
    const credits = unitCredits * quantity;
    const subtotalMinor = unitPriceMinor * quantity;
    const discountMinor = 0;
    const taxMinor = schedule.taxPolicyEnabled ? Math.round(subtotalMinor * schedule.taxRateBps / 10_000) : 0;
    const totalMinor = subtotalMinor - discountMinor + taxMinor;
    if (![credits, subtotalMinor, taxMinor, totalMinor].every(Number.isSafeInteger) || totalMinor < 1) throw new BadRequestException('Le total de commande dépasse les limites autorisées.');
    return {
      orderType, packId: pack.id, packKey: pack.key, packName: pack.name, quantity, unitCredits, credits,
      currency: pack.currency, unitPriceMinor, discountMinor, discountRule: null,
      taxEnabled: schedule.taxPolicyEnabled, taxRule: schedule.taxPolicyEnabled ? schedule.taxRuleCode : null,
      taxRateBps: schedule.taxPolicyEnabled ? schedule.taxRateBps : 0, taxMinor,
      subtotalMinor, totalMinor, priceScheduleId: schedule.id, priceScheduleVersion: schedule.version,
    };
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
    if (Object.keys(input).some((key) => !['effectiveAt', 'changeReason', 'packs', 'rules', 'taxPolicy'].includes(key))) throw new BadRequestException('Champs de grille tarifaire non autorisés.');
    const changeReason = text(input['changeReason'], 'Le motif de modification', 500);
    if (changeReason.length < 10) throw new BadRequestException('Le motif de modification doit contenir au moins 10 caractères.');
    const rawEffectiveAt = input['effectiveAt'];
    if (typeof rawEffectiveAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(rawEffectiveAt)) throw new BadRequestException('La date de prise d’effet doit être une date ISO UTC.');
    const effectiveAt = new Date(rawEffectiveAt);
    if (!Number.isFinite(effectiveAt.getTime()) || effectiveAt <= new Date(Date.now() + 60_000)) throw new BadRequestException('La grille doit prendre effet au moins une minute dans le futur.');
    const rawTaxPolicy = input['taxPolicy'] === undefined ? { enabled: false, ruleCode: null, rateBps: 0 } : object(input['taxPolicy']);
    if (Object.keys(rawTaxPolicy).some((key) => !['enabled', 'ruleCode', 'rateBps'].includes(key)) || typeof rawTaxPolicy['enabled'] !== 'boolean') throw new BadRequestException('La configuration fiscale est invalide.');
    const taxPolicy: TaxPolicy = rawTaxPolicy['enabled']
      ? { enabled: true, ruleCode: text(rawTaxPolicy['ruleCode'], 'Le code de règle fiscale', 80), rateBps: positive(rawTaxPolicy['rateBps'], 'Le taux fiscal en points de base') }
      : { enabled: false, ruleCode: null, rateBps: 0 };
    if (taxPolicy.rateBps > 10_000 || taxPolicy.enabled && !/^[A-Za-z0-9._:-]{2,80}$/.test(taxPolicy.ruleCode ?? '')) throw new BadRequestException('La configuration fiscale est invalide.');
    if (taxPolicy.enabled && process.env['BILLING_TAX_POLICY_APPROVED'] !== 'true') throw new BadRequestException('La règle fiscale reste désactivée tant que sa validation officielle n’est pas approuvée.');
    if (!Array.isArray(input['packs']) || input['packs'].length < 1 || input['packs'].length > 50) throw new BadRequestException('La grille doit contenir entre 1 et 50 packs.');
    if (!Array.isArray(input['rules']) || input['rules'].length < 1 || input['rules'].length > 100) throw new BadRequestException('La grille doit contenir entre 1 et 100 règles.');
    const packs = (input['packs'] as unknown[]).map((raw): PackInput => {
      const value = object(raw);
      if (Object.keys(value).some((key) => !['key', 'name', 'credits', 'priceMinor', 'currency', 'description', 'segment', 'displayOrder', 'badge', 'validFrom', 'validUntil', 'visible'].includes(key))) throw new BadRequestException('Champs de pack non autorisés.');
      const key = text(value['key'], 'La clé du pack', 60);
      const currency = text(value['currency'], 'La devise', 3);
      if (!packPattern.test(key) || !currencyPattern.test(currency)) throw new BadRequestException('La clé ou la devise du pack est invalide.');
      const segment = value['segment'] === undefined ? 'INDIVIDUAL' : text(value['segment'], 'Le segment client', 30);
      if (!['INDIVIDUAL', 'AGENCY', 'ALL'].includes(segment)) throw new BadRequestException('Le segment client est invalide.');
      const optionalDate = (raw: unknown, label: string): Date | null => {
        if (raw === undefined || raw === null || raw === '') return null;
        if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(raw)) throw new BadRequestException(`${label} doit être une date ISO UTC.`);
        const parsed = new Date(raw);
        if (!Number.isFinite(parsed.getTime())) throw new BadRequestException(`${label} est invalide.`);
        return parsed;
      };
      const validFrom = optionalDate(value['validFrom'], 'Le début de validité');
      const validUntil = optionalDate(value['validUntil'], 'La fin de validité');
      if (validFrom && validUntil && validUntil <= validFrom) throw new BadRequestException('La fin de validité doit suivre le début.');
      const badge = value['badge'] === undefined || value['badge'] === null || value['badge'] === '' ? null : text(value['badge'], 'Le badge commercial', 40);
      const description = value['description'] === undefined ? '' : value['description'];
      if (typeof description !== 'string' || description.length > 1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(description)) throw new BadRequestException('La description du pack est invalide.');
      const visible = value['visible'] === undefined ? true : value['visible'];
      if (typeof visible !== 'boolean') throw new BadRequestException('La visibilité du pack est invalide.');
      return {
        key, name: text(value['name'], 'Le nom du pack', 100), credits: positive(value['credits'], 'Les crédits du pack'),
        priceMinor: positive(value['priceMinor'], 'Le prix en unité mineure'), currency, description: description.trim(), segment,
        displayOrder: positive(value['displayOrder'] ?? 0, 'L’ordre d’affichage', true), badge, validFrom, validUntil, visible,
      };
    });
    const rules = (input['rules'] as unknown[]).map((raw): RuleInput => {
      const value = object(raw);
      if (Object.keys(value).some((key) => !['operation', 'creditCost', 'unit'].includes(key))) throw new BadRequestException('Champs de règle non autorisés.');
      const operation = text(value['operation'], 'L’opération', 120);
      if (!operationPattern.test(operation)) throw new BadRequestException('L’opération de tarification est invalide.');
      return { operation, creditCost: positive(value['creditCost'], 'Le coût en crédits', true), unit: text(value['unit'], 'L’unité', 60) };
    });
    if (new Set(packs.map((pack) => pack.key)).size !== packs.length || new Set(rules.map((rule) => rule.operation)).size !== rules.length) throw new BadRequestException('Les clés de packs et opérations doivent être uniques.');
    if (!packs.some((pack) => pack.visible)) throw new BadRequestException('Au moins un pack doit rester visible à la vente.');
    if (!rules.some((rule) => rule.operation === 'invitation.final.personalized' && rule.creditCost === 1)) throw new BadRequestException('Chaque invitation finale personnalisée doit coûter exactement un crédit.');
    if (!rules.some((rule) => rule.operation === 'invitation.preview' && rule.creditCost === 0) || !rules.some((rule) => rule.operation === 'invitation.test' && rule.creditCost === 0)) throw new BadRequestException('Les aperçus et tests doivent rester gratuits.');

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(7192017)`);
        const existing = await tx.priceSchedule.findUnique({ where: { idempotencyKey: rawKey }, include: { packs: true, rules: true } });
        if (existing) {
          if (existing.createdBy !== createdBy || existing.effectiveAt.getTime() !== effectiveAt.getTime() || existing.changeReason !== changeReason || !sameScheduleDefinition(existing, packs, rules) || !sameTaxPolicy(existing, taxPolicy)) throw new ConflictException('La clé d’idempotence a déjà été utilisée pour une autre grille tarifaire.');
          return existing;
        }
        const last = await tx.priceSchedule.aggregate({ _max: { version: true } });
        const latest = await tx.priceSchedule.findFirst({ orderBy: { effectiveAt: 'desc' }, select: { effectiveAt: true } });
        if (latest && effectiveAt <= latest.effectiveAt) throw new BadRequestException('La prise d’effet doit suivre la dernière grille planifiée.');
        const version = (last._max.version ?? 0) + 1;
        const previous = await tx.priceSchedule.findFirst({ orderBy: { version: 'desc' }, select: { id: true, version: true } });
        const schedule = await tx.priceSchedule.create({ data: {
          version, effectiveAt, createdBy, changeReason, taxPolicyEnabled: taxPolicy.enabled, taxRuleCode: taxPolicy.ruleCode, taxRateBps: taxPolicy.rateBps, idempotencyKey: rawKey,
          packs: { create: packs }, rules: { create: rules },
        } });
        await tx.outboxMessage.create({ data: { eventType: 'billing.price-schedule-published.v1', aggregateId: schedule.id, payload: { scheduleId: schedule.id, version, effectiveAt, createdBy, changeReason, previousScheduleId: previous?.id ?? null, previousVersion: previous?.version ?? null, packs, taxPolicy } } });
        return tx.priceSchedule.findUniqueOrThrow({ where: { id: schedule.id }, include: { packs: true, rules: true } });
      });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) throw error;
      if (!duplicate(error)) throw error;
      const prior = await this.prisma.priceSchedule.findUnique({ where: { idempotencyKey: rawKey }, include: { packs: true, rules: true } });
      if (prior && prior.createdBy === createdBy && prior.effectiveAt.getTime() === effectiveAt.getTime() && prior.changeReason === changeReason && sameScheduleDefinition(prior, packs, rules) && sameTaxPolicy(prior, taxPolicy)) return prior;
      throw new ConflictException('La grille ou sa clé d’idempotence existe déjà.');
    }
  }
}
