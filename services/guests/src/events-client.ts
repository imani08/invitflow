import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { requiredEnv } from './env.js';

export type CeremonyReference = { id: string; name: string; status: string };
export type EventReference = { id: string; status: string; ceremonies: CeremonyReference[] };

@Injectable()
export class EventsClient {
  private readonly baseUrl = requiredEnv('EVENTS_SERVICE_URL').replace(/\/$/, '');

  async getOwnedEvent(eventId: string, authorization: string): Promise<EventReference> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/events/${encodeURIComponent(eventId)}`, {
        headers: { authorization }, cache: 'no-store', signal: AbortSignal.timeout(4_000),
      });
    } catch {
      throw new ServiceUnavailableException('Events service is unavailable');
    }
    if (response.status === 404) throw new NotFoundException('Event not found');
    if (response.status === 401) throw new ServiceUnavailableException('Identity token cannot access Events service');
    if (!response.ok) throw new ServiceUnavailableException('Events service request failed');
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object') throw new ServiceUnavailableException('Events service returned an invalid response');
    const record = value as Record<string, unknown>;
    if (record['id'] !== eventId || !Array.isArray(record['ceremonies'])) throw new ServiceUnavailableException('Events service returned an invalid event');
    return record as unknown as EventReference;
  }

  async assertCeremonies(eventId: string, ceremonyIds: string[], authorization: string, allowDraft = false) {
    const event = await this.getOwnedEvent(eventId, authorization);
    if (!allowDraft && event.status !== 'PUBLISHED') throw new NotFoundException('Published event not found');
    const allowed = new Set(event.ceremonies.map((ceremony) => ceremony.id));
    if (ceremonyIds.some((ceremonyId) => !allowed.has(ceremonyId))) throw new NotFoundException('Ceremony not found');
    return event;
  }
}
