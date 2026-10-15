import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { CheckInLicenseService } from './checkin-license.service.js';

const licenseId = '11111111-1111-4111-8111-111111111111';
const tokenA = `${'a'.repeat(36)}.${'b'.repeat(43)}`;
const tokenB = `${'c'.repeat(36)}.${'d'.repeat(43)}`;

function capacityPrisma(capacity: number) {
  const license = { id: licenseId, status: 'ACTIVE', guestCapacity: capacity, usedGuestCount: 0 };
  const guests = new Set<string>();
  let chain = Promise.resolve();
  return {
    license,
    guests,
    $transaction: async <T>(work: (tx: any) => Promise<T>) => {
      const previous = chain;
      let release!: () => void;
      chain = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await work({
          $queryRaw: async () => [],
          checkInLicense: {
            findFirst: async () => license,
            update: async ({ data }: any) => { license.usedGuestCount += data.usedGuestCount.increment; return license; },
          },
          checkInLicenseGuest: {
            findUnique: async ({ where }: any) => guests.has(where.licenseId_tokenHash.tokenHash) ? { licenseId } : null,
            create: async ({ data }: any) => { guests.add(data.tokenHash); return data; },
          },
        });
      } finally { release(); }
    },
  };
}

test('CheckInLicenseService: concurrent distinct scans never exceed the purchased capacity', async () => {
  const prisma = capacityPrisma(1);
  const service = new CheckInLicenseService(prisma as any, {} as any);
  const accepted = () => Promise.resolve({ alreadyCheckedIn: false });

  const results = await Promise.allSettled([
    service.scanWithinCapacity(licenseId, tokenA, accepted),
    service.scanWithinCapacity(licenseId, tokenB, accepted),
  ]);

  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  assert.ok(results.some((result) => result.status === 'rejected' && result.reason instanceof ForbiddenException));
  assert.equal(prisma.license.usedGuestCount, 1);
  assert.equal(prisma.guests.size, 1);
});

test('CheckInLicenseService: re-scanning the same distinct guest does not consume capacity twice', async () => {
  const prisma = capacityPrisma(1);
  const service = new CheckInLicenseService(prisma as any, {} as any);
  let calls = 0;
  await service.scanWithinCapacity(licenseId, tokenA, async () => ({ alreadyCheckedIn: false }));
  await service.scanWithinCapacity(licenseId, tokenA, async () => ({ alreadyCheckedIn: ++calls > 0 }));
  assert.equal(prisma.license.usedGuestCount, 1);
  assert.equal(prisma.guests.size, 1);
});

test('CheckInLicenseService: repeated payment delivery and multiple purchases create each licence exactly once', async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const prisma = {
    $transaction: async (work: (tx: any) => Promise<unknown>) => work({
      checkInLicense: {
        upsert: async ({ where, create }: any) => {
          const prior = rows.get(where.sourceReference);
          if (prior) return prior;
          rows.set(where.sourceReference, create); return create;
        },
      },
    }),
  };
  const service = new CheckInLicenseService(prisma as any, {} as any);
  await service.createPersonalLicenses('owner', 'payment-a', 2, 50);
  await service.createPersonalLicenses('owner', 'payment-a', 2, 50); // broker retry
  await service.createPersonalLicenses('owner', 'payment-b', 1, 200); // separate purchase
  assert.equal(rows.size, 3);
  assert.equal(rows.get('payment:payment-a:checkin:1')?.['guestCapacity'], 50);
  assert.equal(rows.get('payment:payment-b:checkin:1')?.['guestCapacity'], 200);
});

test('CheckInLicenseService: an already assigned personal licence is reused, not reassigned', async () => {
  const assigned = { id: licenseId, source: 'PERSONAL', status: 'ACTIVE', ownerSubject: 'owner', eventId: '22222222-2222-4222-8222-222222222222' };
  let updates = 0;
  const prisma = {
    checkInLicense: {
      findFirst: async ({ where }: any) => where.eventId ? assigned : { id: 'unassigned', status: 'UNASSIGNED' },
      update: async () => { updates += 1; return assigned; },
    },
  };
  const events = { assertManageableCeremonies: async () => ({ ownerSubject: 'owner', agencyWorkspaceId: null }) };
  const service = new CheckInLicenseService(prisma as any, events as any);
  const result = await service.entitlementForEvent('owner', assigned.eventId as string, 'Bearer test');
  assert.equal(result, assigned);
  assert.equal(updates, 0);
});
