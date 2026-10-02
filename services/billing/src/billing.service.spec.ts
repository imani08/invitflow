import assert from 'node:assert/strict';
import test from 'node:test';
import { BillingService } from './billing.service.js';
import type { PrismaService } from './prisma.service.js';

const now = new Date();
const schedule = {
  id: '5e7fa4c2-bd22-4c5a-9847-920cd0ea9101',
  version: 3,
  effectiveAt: new Date(now.getTime() - 60_000),
  changeReason: 'Tarification de lancement actualisée',
  taxPolicyEnabled: false,
  taxRuleCode: null,
  taxRateBps: 0,
  packs: [
    { id: 'pack-hidden', key: 'hidden', name: 'Hidden', credits: 50, priceMinor: 1000, currency: 'USD', description: '', segment: 'INDIVIDUAL', displayOrder: 1, badge: null, validFrom: null, validUntil: null, visible: false },
    { id: 'pack-later', key: 'later', name: 'Later', credits: 100, priceMinor: 2000, currency: 'USD', description: '', segment: 'INDIVIDUAL', displayOrder: 2, badge: null, validFrom: new Date(now.getTime() + 60_000), validUntil: null, visible: true },
    { id: 'pack-expired', key: 'expired', name: 'Expired', credits: 150, priceMinor: 3000, currency: 'USD', description: '', segment: 'INDIVIDUAL', displayOrder: 3, badge: null, validFrom: null, validUntil: new Date(now.getTime() - 60_000), visible: true },
    { id: 'pack-agency', key: 'agency', name: 'Agency', credits: 500, priceMinor: 2900, currency: 'USD', description: '', segment: 'AGENCY', displayOrder: 4, badge: null, validFrom: null, validUntil: null, visible: true },
    { id: 'pack-second', key: 'second', name: 'Second', credits: 200, priceMinor: 4000, currency: 'USD', description: 'Second pack', segment: 'ALL', displayOrder: 20, badge: 'Populaire', validFrom: null, validUntil: null, visible: true },
    { id: 'pack-first', key: 'first', name: 'First', credits: 100, priceMinor: 2500, currency: 'USD', description: 'First pack', segment: 'INDIVIDUAL', displayOrder: 10, badge: null, validFrom: null, validUntil: null, visible: true },
  ],
  rules: [{ operation: 'invitation.final.personalized', creditCost: 1, unit: 'invitation' }],
};

function service() {
  const prisma = {
    priceSchedule: {
      findFirst: async () => schedule,
    },
  } as unknown as PrismaService;
  return new BillingService(prisma);
}

function scheduleReplayService(existing: typeof schedule) {
  const tx = {
    $queryRaw: async () => [],
    priceSchedule: { findUnique: async () => existing },
  };
  const prisma = { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) } as unknown as PrismaService;
  return new BillingService(prisma);
}

test('public catalog exposes only visible in-window packs in configured order', async () => {
  const result = await service().catalog();
  assert.deepEqual(result.packs.map((pack) => pack.id), ['pack-first', 'pack-second']);
  assert.equal(result.packs[0]?.description, 'First pack');
  assert.equal(result.packs[1]?.badge, 'Populaire');
});

test('agency catalog returns only dynamically published agency and shared offers', async () => {
  const result = await service().catalog('AGENCY');
  assert.deepEqual(result.packs.map((pack) => pack.id), ['pack-agency', 'pack-second']);
  await assert.rejects(service().catalog('UNKNOWN'), /Segment tarifaire invalide/);
});

test('finance catalog retains archived and out-of-window packs for versioned editing', async () => {
  const result = await service().adminCatalog();
  assert.equal(result.changeReason, schedule.changeReason);
  assert.deepEqual(new Set(result.packs.map((pack) => pack.id)), new Set([
    'pack-hidden', 'pack-later', 'pack-expired', 'pack-agency', 'pack-first', 'pack-second',
  ]));
});

test('credit quote uses the current persisted rule and rejects client-supplied prices', async () => {
  const billing = service();
  const quote = await billing.quote({ operation: 'invitation.final.personalized', quantity: 12 });
  assert.equal(quote.creditTotal, 12);
  await assert.rejects(
    billing.quote({ operation: 'invitation.final.personalized', quantity: 12, priceMinor: 1 }),
  );
});

test('checkout quote snapshots unit price, quantity, credits, discount and disabled tax from Billing', async () => {
  const packId = '8e7fa4c2-bd22-4c5a-9847-920cd0ea9101';
  const selectedSchedule = { ...schedule, packs: [{ ...schedule.packs[0]!, id: packId, key: 'starter', credits: 50, priceMinor: 1500, currency: 'USD', visible: true, segment: 'INDIVIDUAL' }] };
  const prisma = { priceSchedule: { findFirst: async () => selectedSchedule } } as unknown as PrismaService;
  const quote = await new BillingService(prisma).checkoutQuote({ packId, quantity: 2 });
  assert.deepEqual(quote, {
    orderType: 'CREDIT_PURCHASE', packId, packKey: 'starter', packName: 'Hidden', quantity: 2, unitCredits: 50, credits: 100,
    currency: 'USD', unitPriceMinor: 1500, discountMinor: 0, discountRule: null,
    taxEnabled: false, taxRule: null, taxRateBps: 0, taxMinor: 0, subtotalMinor: 3000,
    totalMinor: 3000, priceScheduleId: schedule.id, priceScheduleVersion: schedule.version,
  });
});

test('agency subscription quote requires agency pack and snapshots its configured quota and price', async () => {
  const packId = '8e7fa4c2-bd22-4c5a-9847-920cd0ea9101';
  const selectedSchedule = { ...schedule, packs: [{ ...schedule.packs[3]!, id: packId, key: 'agency-pro', name: 'Agency Pro', credits: 1500, priceMinor: 5900, currency: 'USD', visible: true }] };
  const prisma = { priceSchedule: { findFirst: async () => selectedSchedule } } as unknown as PrismaService;
  const quote = await new BillingService(prisma).checkoutQuote({ packId, orderType: 'AGENCY_SUBSCRIPTION' });
  assert.equal(quote.orderType, 'AGENCY_SUBSCRIPTION');
  assert.equal(quote.credits, 1500);
  assert.equal(quote.totalMinor, 5900);
  const wrongSegment = { priceSchedule: { findFirst: async () => ({ ...selectedSchedule, packs: [{ ...selectedSchedule.packs[0]!, segment: 'INDIVIDUAL' }] }) } } as unknown as PrismaService;
  await assert.rejects(new BillingService(wrongSegment).checkoutQuote({ packId, orderType: 'AGENCY_SUBSCRIPTION' }));
});

test('checkout quote computes only an explicitly configured synthetic rate and never invents a tax rule', async () => {
  const packId = '8e7fa4c2-bd22-4c5a-9847-920cd0ea9101';
  const selectedSchedule = {
    ...schedule, taxPolicyEnabled: true, taxRuleCode: 'test-only', taxRateBps: 250,
    packs: [{ ...schedule.packs[0]!, id: packId, key: 'starter', credits: 50, priceMinor: 1500, currency: 'USD', visible: true, segment: 'INDIVIDUAL' }],
  };
  const prisma = { priceSchedule: { findFirst: async () => selectedSchedule } } as unknown as PrismaService;
  const quote = await new BillingService(prisma).checkoutQuote({ packId, quantity: 3 });
  assert.equal(quote.taxRule, 'test-only');
  assert.equal(quote.taxRateBps, 250);
  assert.equal(quote.taxMinor, 113);
  assert.equal(quote.totalMinor, 4613);
});

test('tax activation is rejected until the deployment explicitly approves official tax rules', async () => {
  const previous = process.env['BILLING_TAX_POLICY_APPROVED'];
  delete process.env['BILLING_TAX_POLICY_APPROVED'];
  try {
    await assert.rejects(
      service().createSchedule('finance-admin', 'tax-schedule-key', {
        effectiveAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        changeReason: 'Activation fiscale validée',
        taxPolicy: { enabled: true, ruleCode: 'official-rule-pending', rateBps: 100 },
        packs: [{ key: 'starter', name: 'Starter', credits: 50, priceMinor: 1500, currency: 'USD' }],
        rules: [
          { operation: 'invitation.final.personalized', creditCost: 1, unit: 'invitation' },
          { operation: 'invitation.preview', creditCost: 0, unit: 'preview' },
          { operation: 'invitation.test', creditCost: 0, unit: 'preview' },
        ],
      }),
      /validation officielle n’est pas approuvée/,
    );
  } finally {
    if (previous === undefined) delete process.env['BILLING_TAX_POLICY_APPROVED'];
    else process.env['BILLING_TAX_POLICY_APPROVED'] = previous;
  }
});

test('rejects a new schedule that changes the fixed final-invitation credit cost', async () => {
  const billing = service();
  await assert.rejects(
    billing.createSchedule('finance-admin', 'schedule-key', {
      effectiveAt: new Date(Date.now() + 120_000).toISOString(),
      changeReason: 'Test de règle métier',
      packs: [{ key: 'starter', name: 'Starter', credits: 50, priceMinor: 1500, currency: 'USD' }],
      rules: [
        { operation: 'invitation.final.personalized', creditCost: 2, unit: 'invitation' },
        { operation: 'invitation.preview', creditCost: 0, unit: 'preview' },
        { operation: 'invitation.test', creditCost: 0, unit: 'preview' },
      ],
    }),
    /exactement un crédit/,
  );
});

test('idempotent schedule replay only succeeds when the complete pack and rule definition matches', async () => {
  const effectiveAt = new Date(Date.now() + 5 * 60_000);
  const input = {
    effectiveAt: effectiveAt.toISOString(),
    changeReason: 'Tarification de lancement actualisée',
    packs: [{ key: 'starter', name: 'Starter', credits: 50, priceMinor: 1500, currency: 'USD' }],
    rules: [
      { operation: 'invitation.final.personalized', creditCost: 1, unit: 'invitation' },
      { operation: 'invitation.preview', creditCost: 0, unit: 'preview' },
      { operation: 'invitation.test', creditCost: 0, unit: 'preview' },
    ],
  };
  const existing = {
    ...schedule,
    createdBy: 'finance-admin',
    effectiveAt,
    idempotencyKey: 'schedule-key',
    packs: [{
      id: 'pack-starter', scheduleId: schedule.id, ...input.packs[0], description: '', segment: 'INDIVIDUAL',
      displayOrder: 0, badge: null, validFrom: null, validUntil: null, visible: true,
      createdAt: new Date(),
    }],
    rules: input.rules.map((rule, index) => ({ id: `rule-${index}`, scheduleId: schedule.id, ...rule })),
  } as unknown as typeof schedule;
  const billing = scheduleReplayService(existing);

  assert.equal(await billing.createSchedule('finance-admin', 'schedule-key', input), existing);
  await assert.rejects(
    billing.createSchedule('finance-admin', 'schedule-key', {
      ...input,
      packs: [{ ...input.packs[0], priceMinor: 1600 }],
    }),
    /utilisée pour une autre grille tarifaire/,
  );
});
