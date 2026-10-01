import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { requiredEnv } from './env.js';

type GuestReference = {
  id: string;
  access: { ceremonyId: string; isInvited: boolean; allowedCompanions: number }[];
};

@Injectable()
export class GuestsClient {
  private readonly baseUrl = requiredEnv('GUESTS_SERVICE_URL').replace(/\/$/, '');

  async reservedSeats(
    eventId: string,
    ceremonyId: string,
    guestId: string,
    authorization: string,
  ): Promise<number> {
    let response: Response;
    try {
      response = await fetch(
        `${this.baseUrl}/v1/events/${encodeURIComponent(eventId)}/guests/${encodeURIComponent(guestId)}`,
        {
          headers: { authorization },
          cache: 'no-store',
          signal: AbortSignal.timeout(9_000),
        },
      );
    } catch {
      throw new ServiceUnavailableException('Guests service is unavailable');
    }
    if (response.status === 404) throw new NotFoundException('Guest not found');
    if (response.status === 401)
      throw new ServiceUnavailableException('Identity token cannot access Guests service');
    if (!response.ok) throw new ServiceUnavailableException('Guests service request failed');
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new ServiceUnavailableException('Guests service returned an invalid response');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new ServiceUnavailableException('Guests service returned an invalid response');
    const guest = value as GuestReference;
    if (guest.id !== guestId || !Array.isArray(guest.access))
      throw new ServiceUnavailableException('Guests service returned an invalid guest');
    const access = guest.access.find(
      (item) => item && typeof item === 'object' && item.ceremonyId === ceremonyId,
    );
    if (!access || access.isInvited !== true)
      throw new NotFoundException('Guest is not invited to this ceremony');
    if (
      !Number.isInteger(access.allowedCompanions) ||
      access.allowedCompanions < 0 ||
      access.allowedCompanions > 20
    )
      throw new ServiceUnavailableException('Guests service returned invalid access data');
    return 1 + access.allowedCompanions;
  }
}
