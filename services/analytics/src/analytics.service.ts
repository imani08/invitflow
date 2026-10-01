import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { mapAnalyticsEvent, type AnalyticsEvent } from './metrics.js';
import { PrismaService } from './prisma.service.js';

const eventIdPattern = /^[A-Za-z0-9._:-]{1,64}$/;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async consume(event: AnalyticsEvent) {
    if (!event || typeof event !== 'object' || !eventIdPattern.test(event.eventId))
      throw new ConflictException('Événement Analytics invalide.');
    const mapped = mapAnalyticsEvent(event);
    if (!mapped) throw new ConflictException('Enveloppe Analytics invalide.');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processedEvent.create({
          data: {
            eventId: event.eventId,
            eventType: event.eventType,
            occurredAt: new Date(event.occurredAt),
          },
        });
        for (const delta of mapped.deltas) {
          await tx.dailyMetric.upsert({
            where: {
              day_metric_currency: {
                day: mapped.day,
                metric: delta.metric,
                currency: delta.currency ?? '',
              },
            },
            create: {
              day: mapped.day,
              metric: delta.metric,
              currency: delta.currency ?? '',
              count: BigInt(delta.count),
              valueMinor: BigInt(delta.valueMinor ?? 0),
            },
            update: {
              count: { increment: BigInt(delta.count) },
              valueMinor: { increment: BigInt(delta.valueMinor ?? 0) },
            },
          });
        }
      });
      return { processed: true };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return { processed: false, duplicate: true };
      throw error;
    }
  }

  async list(from?: string, to?: string) {
    const now = new Date();
    const end = to
      ? new Date(`${to}T00:00:00.000Z`)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = from
      ? new Date(`${from}T00:00:00.000Z`)
      : new Date(end.getTime() - 29 * 86_400_000);
    if (
      !validDay(start, from) ||
      !validDay(end, to) ||
      start > end ||
      end.getTime() - start.getTime() > 89 * 86_400_000
    ) {
      throw new BadRequestException(
        'La période Analytics doit couvrir au plus 90 jours calendaires valides.',
      );
    }
    const rows = await this.prisma.dailyMetric.findMany({
      where: { day: { gte: start, lte: end } },
      orderBy: [{ day: 'asc' }, { metric: 'asc' }, { currency: 'asc' }],
    });
    return {
      from: start.toISOString().slice(0, 10),
      to: end.toISOString().slice(0, 10),
      items: rows.map((row) => ({
        ...row,
        count: row.count.toString(),
        valueMinor: row.valueMinor.toString(),
      })),
    };
  }
}

function validDay(value: Date, original?: string) {
  if (!Number.isFinite(value.getTime())) return false;
  return (
    original === undefined ||
    (/^\d{4}-\d{2}-\d{2}$/.test(original) && value.toISOString().slice(0, 10) === original)
  );
}
