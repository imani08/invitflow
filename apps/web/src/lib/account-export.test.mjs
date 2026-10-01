import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccountExportError, collectAccountExport } from './account-export.mjs';

const profile = {
  email: 'owner@example.test',
  displayName: 'Compte InvitaFlow',
  locale: 'fr',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-09-30T00:00:00.000Z',
};

test('exports the owner profile and all supported account datasets through authenticated APIs', async () => {
  const requests = [];
  const eventId = '550e8400-e29b-41d4-a716-446655440010';
  const ceremonyId = '550e8400-e29b-41d4-a716-446655440011';
  const designId = '550e8400-e29b-41d4-a716-446655440012';
  const batchId = '550e8400-e29b-41d4-a716-446655440013';
  const fetcher = async (url, init) => {
    assert.equal(init.headers.authorization, 'Bearer private-test-token');
    requests.push(new URL(url));
    const path = new URL(url).pathname;
    let value;
    if (path === '/v1/profile/me') value = profile;
    else if (path === '/v1/events')
      value = {
        items: [{ id: eventId, name: 'Mariage', ceremonies: [{ id: ceremonyId }] }],
        nextCursor: null,
      };
    else if (path === `/v1/events/${eventId}/guests`)
      value = { items: [{ id: 'guest-1', fullName: 'Invité' }], nextCursor: null };
    else if (path === `/v1/events/${eventId}/designs`) value = { items: [{ id: designId }] };
    else if (path === `/v1/events/${eventId}/designs/${designId}`)
      value = { id: designId, document: { elements: [] } };
    else if (path === `/v1/events/${eventId}/designs/${designId}/versions`)
      value = { items: [{ version: 1, document: { elements: [] } }] };
    else if (path === `/v1/events/${eventId}/ceremonies/${ceremonyId}/seating`)
      value = { mode: 'TABLE', assignments: [] };
    else if (path === `/v1/events/${eventId}/check-in`)
      value = { checkedIn: 0, accepted: 0, recent: [] };
    else if (path === '/v1/invitations/batches')
      value = { items: [{ id: batchId }], nextCursor: null };
    else if (path === `/v1/invitations/batches/${batchId}`)
      value = {
        id: batchId,
        items: [{ guestId: 'guest-1', objectKey: 'private/internal-key', status: 'GENERATED' }],
      };
    else if (path === '/v1/wallet/me') value = { availableCredits: 20, reservedCredits: 0 };
    else if (path === '/v1/wallet/me/transactions')
      value = { items: [{ id: 'entry-1' }], nextCursor: null };
    else if (path === '/v1/payments/me')
      value = {
        items: [{ id: 'payment-1', checkoutUrl: 'https://checkout/private' }],
        nextCursor: null,
      };
    else if (path === '/v1/notifications')
      value = { items: [{ id: 'notification-1' }], nextCursor: null };
    else if (path === '/v1/notifications/preferences') value = { emailEnabled: false };
    else if (path === '/v1/assets')
      value = { items: [{ id: 'asset-1', status: 'QUARANTINED' }], nextCursor: null };
    else assert.fail(`Unexpected export request: ${url}`);
    return Response.json(value);
  };

  const result = await collectAccountExport({
    accessToken: 'private-test-token',
    gateway: 'http://gateway:3002',
    exportedAt: '2026-09-30T12:00:00.000Z',
    fetcher,
  });
  assert.equal(result.format, 'invitaflow-account-export-v1');
  assert.equal(result.profile.email, profile.email);
  assert.equal(result.events[0].guests[0].fullName, 'Invité');
  assert.equal(result.events[0].designs[0].versions[0].document.elements.length, 0);
  assert.equal(result.events[0].invitationBatches[0].items[0].objectKey, undefined);
  assert.equal(result.payments[0].checkoutUrl, undefined);
  assert.equal(JSON.stringify(result).includes('private-test-token'), false);
  assert.equal(JSON.stringify(result).includes('private/internal-key'), false);
  assert.equal(requests.length, 16);
  assert.ok(result.notIncluded.some((entry) => entry.includes('PDF/ZIP')));
});

test('refuses incomplete pages that repeat a cursor instead of exporting a partial account', async () => {
  const fetcher = async (url) => {
    const path = new URL(url).pathname;
    if (path === '/v1/profile/me') return Response.json(profile);
    if (path === '/v1/events') return Response.json({ items: [], nextCursor: 'same-cursor' });
    return Response.json({});
  };
  await assert.rejects(
    () => collectAccountExport({ accessToken: 'token', gateway: 'http://gateway:3002', fetcher }),
    (error) => error instanceof AccountExportError && error.code === 'invalid_account_page',
  );
});
