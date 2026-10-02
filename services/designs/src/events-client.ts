import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { requiredEnv } from './env.js';

type EventReference = { id: string; ceremonies?: { ceremonyType?: unknown }[] };

@Injectable()
export class EventsClient {
  private readonly baseUrl = requiredEnv('EVENTS_SERVICE_URL').replace(/\/$/, '');

  async assertOwnerEvent(eventId: string, authorization: string): Promise<EventReference> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/events/${encodeURIComponent(eventId)}`, { headers: { authorization }, cache: 'no-store', signal: AbortSignal.timeout(4_000) });
    } catch { throw new ServiceUnavailableException('Events service is unavailable'); }
    if (response.status === 404) throw new NotFoundException('Event not found');
    if (response.status === 401) throw new ServiceUnavailableException('Identity token cannot access Events service');
    if (!response.ok) throw new ServiceUnavailableException('Events service request failed');
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || (value as EventReference).id !== eventId) throw new ServiceUnavailableException('Events service returned an invalid event');
    const event = value as EventReference;
    if (event.ceremonies !== undefined && (!Array.isArray(event.ceremonies) || event.ceremonies.some((item) => !item || typeof item !== 'object'))) throw new ServiceUnavailableException('Events service returned invalid ceremony data');
    return event;
  }
}
