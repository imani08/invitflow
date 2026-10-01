export type MetricDelta = { metric: string; count: number; valueMinor?: number; currency?: string };
export type AnalyticsEvent = {
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: unknown;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function currency(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : null;
}

export function mapAnalyticsEvent(
  event: AnalyticsEvent,
): { day: Date; deltas: MetricDelta[] } | null {
  if (
    !/^[A-Za-z0-9._:-]{1,64}$/.test(event.eventId) ||
    !/^[a-z][a-z0-9.-]{0,99}\.v[1-9][0-9]*$/.test(event.eventType)
  )
    return null;
  const occurredAt = new Date(event.occurredAt);
  if (!Number.isFinite(occurredAt.getTime())) return null;
  const day = new Date(
    Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), occurredAt.getUTCDate()),
  );
  const payload = object(event.payload);
  let deltas: MetricDelta[] = [];

  switch (event.eventType) {
    case 'events.created.v1':
      deltas = [{ metric: 'events_created', count: 1 }];
      break;
    case 'invitation.batch.completed.v1': {
      const count = integer(payload['generatedCount']);
      if (count !== null) deltas = [{ metric: 'invitations_generated', count }, { metric: 'render_total', count }];
      break;
    }
    case 'invitation.batch.failed.v1':
      deltas = [{ metric: 'invitation_batches_failed', count: 1 }, { metric: 'render_failures', count: 1 }];
      break;
    case 'invitation.rsvp.updated.v1': {
      const count = integer(payload['responseCount']);
      if (count !== null) deltas = [{ metric: 'rsvp_responses', count }];
      break;
    }
    case 'invitation.checkin.created.v1':
      deltas = [{ metric: 'checkins', count: 1 }];
      break;
    case 'payment.succeeded.v1': {
      const credits = integer(payload['credits']);
      const amountMinor = integer(payload['amountMinor']);
      const unit = currency(payload['currency']);
      deltas = [{ metric: 'payments_succeeded', count: 1 }];
      if (credits !== null) deltas.push({ metric: 'credits_sold', count: credits });
      if (amountMinor !== null && unit)
        deltas.push({ metric: 'revenue_minor', count: 1, valueMinor: amountMinor, currency: unit });
      break;
    }
    case 'payment.refunded.v1': {
      const amountMinor = integer(payload['amountMinor']);
      const unit = currency(payload['currency']);
      deltas = [{ metric: 'payments_refunded', count: 1 }];
      if (amountMinor !== null && unit)
        deltas.push({ metric: 'refund_minor', count: 1, valueMinor: amountMinor, currency: unit });
      break;
    }
    case 'payment.failed.v1':
      deltas = [{ metric: 'payments_failed', count: 1 }];
      break;
    case 'credits.settled.v1': {
      const reservedDelta = payload['reservedDelta'];
      const availableDelta = payload['availableDelta'];
      if (
        typeof reservedDelta === 'number' &&
        Number.isSafeInteger(reservedDelta) &&
        reservedDelta <= 0 &&
        typeof availableDelta === 'number' &&
        Number.isSafeInteger(availableDelta) &&
        availableDelta >= 0
      ) {
        const consumed = -reservedDelta - availableDelta;
        if (Number.isSafeInteger(consumed) && consumed >= 0)
          deltas = [{ metric: 'credits_consumed', count: consumed }];
      }
      break;
    }
    case 'ai.design.job-queued.v1':
      deltas = [{ metric: 'ai_jobs_total', count: 1 }];
      break;
    case 'ai.design.proposal-ready.v1':
      deltas = [{ metric: 'ai_jobs_completed', count: 1 }];
      break;
    case 'ai.design.job-failed.v1':
      deltas = [{ metric: 'ai_jobs_failed', count: 1 }];
      break;
  }
  return { day, deltas };
}
