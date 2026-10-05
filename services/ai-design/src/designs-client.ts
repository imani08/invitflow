import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { requiredEnv } from './env.js';

export type DesignSnapshot = { id: string; eventId: string; name: string; version: number; document: unknown };

@Injectable()
export class DesignsClient {
  private readonly baseUrl = requiredEnv('DESIGNS_SERVICE_URL').replace(/\/$/, '');

  async editorial(eventId: string, designId: string, authorization: string) {
    const response = await fetch(this.baseUrl + '/v1/events/' + encodeURIComponent(eventId) + '/designs/' + encodeURIComponent(designId) + '/validate', { method: 'POST', headers: { authorization }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new ServiceUnavailableException('Editorial context unavailable');
    const value = await response.json() as { editorial: { sourceVersion: number; fields: { elementId: string; sourceText: string; protectedTerms: string[]; target: { overflow: boolean; maxCharacters: number; maxEstimatedLines: number; targetReductionRatio: number }; layer: Record<string, unknown> }[] } };
    return value.editorial;
  }

  async get(eventId: string, designId: string, authorization: string): Promise<DesignSnapshot> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/v1/events/${encodeURIComponent(eventId)}/designs/${encodeURIComponent(designId)}`, { headers: { authorization }, cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    } catch { throw new ServiceUnavailableException('Designs service is unavailable'); }
    if (response.status === 404) throw new NotFoundException('Design introuvable.');
    if (response.status === 401) throw new ServiceUnavailableException('Identity token cannot access Designs service');
    if (!response.ok) throw new ServiceUnavailableException('Designs service request failed');
    const value: unknown = await response.json();
    if (!value || typeof value !== 'object' || (value as DesignSnapshot).id !== designId || (value as DesignSnapshot).eventId !== eventId || !('document' in value)) throw new ServiceUnavailableException('Designs service returned an invalid design');
    return value as DesignSnapshot;
  }
}
