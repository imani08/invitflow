import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PaymentOrderType } from '../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async attribute(customerSubject: string, rawCode: unknown, source: 'CODE' | 'LINK' = 'CODE') {
    if (typeof rawCode !== 'string' || !/^[A-Za-z0-9_-]{3,60}$/.test(rawCode)) throw new BadRequestException('Partner code is invalid');
    const partner = await this.prisma.partner.findUnique({ where: { code: rawCode }, select: { id: true, code: true, status: true, ownerSubject: true } });
    if (!partner || partner.status !== 'ACTIVE') throw new NotFoundException('Partner code not found');
    if (partner.ownerSubject === customerSubject) throw new ForbiddenException('Self-referral is not allowed');
    const prior = await this.prisma.referralAttribution.findUnique({ where: { customerSubject } });
    if (prior) {
      if (prior.partnerId !== partner.id || prior.status !== 'ACTIVE') throw new ConflictException('An existing referral attribution cannot be overwritten');
      return prior;
    }
    try { return await this.prisma.referralAttribution.create({ data: { partnerId: partner.id, customerSubject, source, codeSnapshot: partner.code } }); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new ConflictException('Referral attribution already exists');
      throw error;
    }
  }

  async dashboard(subject: string) {
    const partner = await this.prisma.partner.findUnique({ where: { ownerSubject: subject } });
    if (!partner) throw new NotFoundException('Partner account is not active');
    const [clients, sales, entries, payouts] = await Promise.all([
      this.prisma.referralAttribution.count({ where: { partnerId: partner.id, status: 'ACTIVE' } }),
      this.prisma.paymentOrder.count({ where: { ownerSubject: { in: (await this.prisma.referralAttribution.findMany({ where: { partnerId: partner.id, status: 'ACTIVE' }, select: { customerSubject: true } })).map((row) => row.customerSubject) }, payment: { is: { status: 'SUCCEEDED' } } } }),
      this.prisma.commissionLedgerEntry.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.partnerPayout.findMany({ where: { partnerId: partner.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    const totals = await this.prisma.commissionLedgerEntry.groupBy({ by: ['status', 'currency'], where: { partnerId: partner.id }, _sum: { commissionAmountMinor: true } });
    return { partner: { id: partner.id, code: partner.code, status: partner.status }, clients, sales, commissions: totals, history: entries, payouts };
  }

  async adminCreate(actor: string, input: { ownerSubject?: string | null; code: string; commissionRateBps: number; eligibleOrderTypes: PaymentOrderType[] }) {
    if (!/^[A-Za-z0-9_-]{3,60}$/.test(input.code) || !Number.isSafeInteger(input.commissionRateBps) || input.commissionRateBps < 0 || input.commissionRateBps > 10_000 || !Array.isArray(input.eligibleOrderTypes) || input.eligibleOrderTypes.some((type) => !Object.values(PaymentOrderType).includes(type))) throw new BadRequestException('Partner setup is invalid');
    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.create({ data: { ownerSubject: input.ownerSubject ?? null, code: input.code, commissionRateBps: input.commissionRateBps, eligibleOrderTypes: input.eligibleOrderTypes } });
      await tx.partnerAuditEntry.create({ data: { partnerId: partner.id, actorSubject: actor, action: 'PARTNER_CREATED', after: { id: partner.id, ownerSubject: partner.ownerSubject, code: partner.code, status: partner.status, commissionRateBps: partner.commissionRateBps, eligibleOrderTypes: partner.eligibleOrderTypes } } });
      return partner;
    });
  }

  adminList() { return this.prisma.partner.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { attributions: true, ledgerEntries: true, payouts: true } } } }); }

  async adminUpdate(actor: string, id: string, input: { ownerSubject?: string | null; status?: 'PENDING' | 'ACTIVE' | 'SUSPENDED'; commissionRateBps?: number; eligibleOrderTypes?: PaymentOrderType[] }) {
    if (Object.keys(input).some((field) => !['ownerSubject', 'status', 'commissionRateBps', 'eligibleOrderTypes'].includes(field)) || !Object.keys(input).length) throw new BadRequestException('Partner change is invalid');
    if (input.ownerSubject !== undefined && input.ownerSubject !== null && (!input.ownerSubject.trim() || input.ownerSubject.length > 255)) throw new BadRequestException('Partner owner reference is invalid');
    if (input.status !== undefined && !['PENDING', 'ACTIVE', 'SUSPENDED'].includes(input.status)) throw new BadRequestException('Partner status is invalid');
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException('Partner not found');
    if (input.commissionRateBps !== undefined && (!Number.isSafeInteger(input.commissionRateBps) || input.commissionRateBps < 0 || input.commissionRateBps > 10_000)) throw new BadRequestException('Commission rate is invalid');
    if (input.eligibleOrderTypes !== undefined && (!Array.isArray(input.eligibleOrderTypes) || input.eligibleOrderTypes.some((type) => !Object.values(PaymentOrderType).includes(type)))) throw new BadRequestException('Eligible order types are invalid');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.partner.update({ where: { id }, data: input });
      const snapshot = (value: typeof updated) => ({ id: value.id, ownerSubject: value.ownerSubject, code: value.code, status: value.status, commissionRateBps: value.commissionRateBps, eligibleOrderTypes: value.eligibleOrderTypes });
      await tx.partnerAuditEntry.create({ data: { partnerId: id, actorSubject: actor, action: 'PARTNER_UPDATED', before: snapshot(partner), after: snapshot(updated) } });
      return updated;
    });
  }

  adminLedger() { return this.prisma.commissionLedgerEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { partner: true } }); }
  adminAttributions() { return this.prisma.referralAttribution.findMany({ orderBy: { attributedAt: 'desc' }, take: 200, include: { partner: true } }); }

  async createPayout(subject: string, requestedCurrency?: string) {
    const partner = await this.prisma.partner.findUnique({ where: { ownerSubject: subject } });
    if (!partner || partner.status !== 'ACTIVE') throw new NotFoundException('Partner account is not active');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "partners" WHERE "id" = ${partner.id}::uuid FOR UPDATE`;
      const entries = await tx.commissionLedgerEntry.findMany({ where: { partnerId: partner.id, ...(requestedCurrency ? { currency: requestedCurrency } : {}), payoutLinks: { none: {} }, OR: [{ status: 'PAYABLE' }, { status: 'REVERSED', originalEntry: { is: { status: 'PAID' } } }] }, orderBy: { createdAt: 'asc' } });
      const currencies = [...new Set(entries.map((entry) => entry.currency))];
      if (currencies.length !== 1) throw new ConflictException(currencies.length ? 'Available payable entries have multiple currencies; select payout currency in admin' : 'No payable commission balance');
      const currency = currencies[0]!;
      const amountMinor = entries.reduce((sum, entry) => sum + entry.commissionAmountMinor, 0);
      if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) throw new ConflictException('No payable commission balance');
      return tx.partnerPayout.create({ data: { partnerId: partner.id, amountMinor, currency, commissions: { createMany: { data: entries.map((entry) => ({ commissionEntryId: entry.id })) } } } });
    });
  }

  async adminSetLedgerStatus(actor: string, id: string, status: 'VALIDATED' | 'PAYABLE' | 'DISPUTED') {
    const entry = await this.prisma.commissionLedgerEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Commission entry not found');
    const allowed = (entry.status === 'PENDING' && ['VALIDATED', 'DISPUTED'].includes(status)) || (entry.status === 'VALIDATED' && ['PAYABLE', 'DISPUTED'].includes(status));
    if (!allowed) throw new ConflictException('Invalid commission status transition');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.commissionLedgerEntry.update({ where: { id }, data: { status } });
      await tx.partnerAuditEntry.create({ data: { partnerId: entry.partnerId, actorSubject: actor, action: `COMMISSION_${status}`, before: { status: entry.status }, after: { id, status } } });
      return updated;
    });
  }

  async adminPayoutUpdate(actor: string, id: string, status: 'APPROVED' | 'PROCESSING' | 'PAID' | 'REJECTED', externalReference?: string) {
    if (!['APPROVED', 'PROCESSING', 'PAID', 'REJECTED'].includes(status)) throw new BadRequestException('Payout status is invalid');
    if (String(status) === 'PAID') throw new ServiceUnavailableException('Payout cannot be marked paid until a provider confirmation verifier is configured');
    if (externalReference !== undefined && typeof externalReference !== 'string') throw new BadRequestException('External reference is invalid');
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.partnerPayout.findUnique({ where: { id }, include: { commissions: { include: { commissionEntry: { include: { originalEntry: true } } } } } });
      if (!payout) throw new NotFoundException('Partner payout not found');
      const allowed = (payout.status === 'PENDING' && ['APPROVED', 'REJECTED'].includes(status)) || (payout.status === 'APPROVED' && ['PROCESSING', 'REJECTED'].includes(status)) || (payout.status === 'PROCESSING' && status === 'PAID');
      if (!allowed) throw new ConflictException('Invalid payout status transition');
      if (status === 'PAID' && (!externalReference || externalReference.trim().length > 255)) throw new BadRequestException('A confirmed external payout reference is required before marking paid');
      if (status === 'PAID') {
        const ids = payout.commissions.map((link) => link.commissionEntryId);
        if (payout.commissions.some((link) => link.commissionEntry.status !== 'PAYABLE' && !(link.commissionEntry.status === 'REVERSED' && link.commissionEntry.originalEntry?.status === 'PAID'))) throw new ConflictException('Payout commissions are no longer payable');
        await tx.commissionLedgerEntry.updateMany({ where: { id: { in: ids }, status: 'PAYABLE' }, data: { status: 'PAID' } });
      }
      const updated = await tx.partnerPayout.update({ where: { id }, data: { status, ...(externalReference ? { externalReference: externalReference.trim() } : {}) } });
      if (status === 'REJECTED') await tx.partnerPayoutCommission.deleteMany({ where: { payoutId: payout.id } });
      await tx.partnerAuditEntry.create({ data: { partnerId: payout.partnerId, actorSubject: actor, action: `PAYOUT_${status}`, before: { status: payout.status }, after: { id, status, externalReference: externalReference ?? null } } });
      return updated;
    });
  }

  adminPayouts() { return this.prisma.partnerPayout.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { partner: true } }); }
  adminAuditEntries() { return this.prisma.partnerAuditEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 200, include: { partner: { select: { code: true } } } }); }
}
