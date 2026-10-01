import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '../generated/prisma/client.js';
import { AnalyticsService } from './analytics.service.js';
import type { PrismaService } from './prisma.service.js';

test('commits event dedupe and daily deltas atomically and ignores a duplicate delivery', async () => {
  const eventIds = new Set<string>();
  const metrics = new Map<string, { count: bigint; valueMinor: bigint }>();
  const tx = {
    processedEvent: {
      create: async ({ data }: { data: { eventId: string } }) => {
        if (eventIds.has(data.eventId)) {
          throw new Prisma.PrismaClientKnownRequestError('duplicate event', {
            code: 'P2002',
            clientVersion: '7.10.0',
          });
        }
        eventIds.add(data.eventId);
      },
    },
    dailyMetric: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { day_metric_currency: { day: Date; metric: string; currency: string } };
        create: { count: bigint; valueMinor: bigint };
        update: { count: { increment: bigint }; valueMinor: { increment: bigint } };
      }) => {
        const key = `${where.day_metric_currency.day.toISOString()}:${where.day_metric_currency.metric}:${where.day_metric_currency.currency}`;
        const current = metrics.get(key);
        metrics.set(
          key,
          current
            ? {
                count: current.count + update.count.increment,
                valueMinor: current.valueMinor + update.valueMinor.increment,
              }
            : { count: create.count, valueMinor: create.valueMinor },
        );
      },
    },
  };
  const prisma = {
    $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) => callback(tx),
  } as unknown as PrismaService;
  const analytics = new AnalyticsService(prisma);
  const event = {
    eventId: 'payment-event-1',
    eventType: 'payment.succeeded.v1',
    occurredAt: '2026-09-30T10:00:00Z',
    payload: { credits: 5, amountMinor: 1200, currency: 'CDF' },
  };

  assert.deepEqual(await analytics.consume(event), { processed: true });
  assert.deepEqual(await analytics.consume(event), { processed: false, duplicate: true });
  assert.equal(metrics.size, 3);
  assert.equal(
    [...metrics.values()].reduce((total, metric) => total + metric.count, 0n),
    7n,
  );
  assert.equal(
    [...metrics.values()].reduce((total, metric) => total + metric.valueMinor, 0n),
    1200n,
  );
});
