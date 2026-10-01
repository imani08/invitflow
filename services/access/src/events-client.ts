import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { requiredEnv } from './env.js';

@Injectable()
export class EventsClient {
  private readonly baseUrl = requiredEnv('EVENTS_SERVICE_URL').replace(/\/$/, '');

  async assertCeremonies(eventId: string, ceremonyIds: string[], authorization: string) {
    return this.fetchEvent(eventId, ceremonyIds, authorization, true);
  }

  async assertManageableCeremonies(eventId: string, ceremonyIds: string[], authorization: string) {
    return this.fetchEvent(eventId, ceremonyIds, authorization, false);
  }

  private async fetchEvent(eventId: string, ceremonyIds: string[], authorization: string, publishedOnly: boolean) {
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ServiceUnavailableException('Events service returned an invalid response');
    const record = value as Record<string, unknown>;
    if (record['id'] !== eventId || !Array.isArray(record['ceremonies']) || (publishedOnly ? record['status'] !== 'PUBLISHED' : !['DRAFT', 'PUBLISHED'].includes(String(record['status'])))) throw new NotFoundException('Event not found');
    const ceremonySet = new Set(record['ceremonies'].flatMap((item) => item && typeof item === 'object' && 'id' in item && typeof item.id === 'string' ? [item.id] : []));
    if (ceremonyIds.some((id) => !ceremonySet.has(id))) throw new NotFoundException('Ceremony not found');
    return record;
  }
}
