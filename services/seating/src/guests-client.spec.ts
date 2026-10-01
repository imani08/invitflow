import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { GuestsClient } from './guests-client.js';

const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ceremonyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const guestId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

async function withResponse(
  response: Response | Error,
  run: (client: GuestsClient) => Promise<void>,
) {
  const previousUrl = process.env['GUESTS_SERVICE_URL'];
  const previousFetch = globalThis.fetch;
  process.env['GUESTS_SERVICE_URL'] = 'http://guests:3005';
  globalThis.fetch = (async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  try {
    await run(new GuestsClient());
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env['GUESTS_SERVICE_URL'];
    else process.env['GUESTS_SERVICE_URL'] = previousUrl;
  }
}

test('returns the guest and allowed companions as reserved seats', async () => {
  await withResponse(
    Response.json({ id: guestId, access: [{ ceremonyId, isInvited: true, allowedCompanions: 3 }] }),
    async (client) => {
      assert.equal(await client.reservedSeats(eventId, ceremonyId, guestId, 'Bearer test'), 4);
    },
  );
});

test('rejects guests who are not invited to the ceremony', async () => {
  await withResponse(
    Response.json({
      id: guestId,
      access: [{ ceremonyId, isInvited: false, allowedCompanions: 0 }],
    }),
    async (client) => {
      await assert.rejects(
        client.reservedSeats(eventId, ceremonyId, guestId, 'Bearer test'),
        NotFoundException,
      );
    },
  );
});

test('maps network, unauthorized and malformed responses to service errors', async () => {
  await withResponse(new Error('socket error'), async (client) => {
    await assert.rejects(
      client.reservedSeats(eventId, ceremonyId, guestId, 'Bearer test'),
      ServiceUnavailableException,
    );
  });
  await withResponse(new Response(null, { status: 401 }), async (client) => {
    await assert.rejects(
      client.reservedSeats(eventId, ceremonyId, guestId, 'Bearer test'),
      ServiceUnavailableException,
    );
  });
  await withResponse(new Response('{invalid', { status: 200 }), async (client) => {
    await assert.rejects(
      client.reservedSeats(eventId, ceremonyId, guestId, 'Bearer test'),
      ServiceUnavailableException,
    );
  });
});

test('rejects invalid companion counts and mismatched guest ids', async () => {
  await withResponse(
    Response.json({
      id: guestId,
      access: [{ ceremonyId, isInvited: true, allowedCompanions: 21 }],
    }),
    async (client) => {
      await assert.rejects(
        client.reservedSeats(eventId, ceremonyId, guestId, 'Bearer test'),
        ServiceUnavailableException,
      );
    },
  );
  await withResponse(Response.json({ id: ceremonyId, access: [] }), async (client) => {
    await assert.rejects(
      client.reservedSeats(eventId, ceremonyId, guestId, 'Bearer test'),
      ServiceUnavailableException,
    );
  });
  await withResponse(
    Response.json({
      id: guestId,
      access: [{ ceremonyId, isInvited: 'true', allowedCompanions: 0 }],
    }),
    async (client) => {
      await assert.rejects(
        client.reservedSeats(eventId, ceremonyId, guestId, 'Bearer test'),
        NotFoundException,
      );
    },
  );
});
