import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { confirmationState } from './invitation-confirmation.mjs';

test('confirmation requires a real completed unexpired batch, not a download click', () => {
  assert.equal(confirmationState(null), 'unavailable');
  for (const status of ['RESERVING', 'QUEUED', 'GENERATING']) assert.equal(confirmationState({ status }), 'pending');
  for (const status of ['FAILED', 'CANCELLED']) assert.equal(confirmationState({ status }), 'failed');
  assert.equal(confirmationState({ status: 'COMPLETED' }), 'ready');
  assert.equal(confirmationState({ status: 'COMPLETED', zipDeletedAt: 'date' }), 'expired');
  assert.equal(confirmationState({ status: 'COMPLETED', zipExpiresAt: 'invalid' }), 'expired');
  assert.equal(confirmationState({ status: 'COMPLETED', zipExpiresAt: '2026-01-01' }, Date.parse('2026-01-02')), 'expired');
  assert.equal(confirmationState({ status: 'COMPLETED', zipExpiresAt: '2026-01-03' }, Date.parse('2026-01-02')), 'ready');
});

test('confirmation route preserves session/ownership lookup and download uses the existing protected API', async () => {
  const page = await readFile(new URL('../app/events/[eventId]/invitations/merci/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /getSession/); assert.match(page, /if \(!session\) redirect/);
  assert.match(page, /authorization: `Bearer \$\{session.accessToken\}`/);
  const component = await readFile(new URL('../app/events/[eventId]/invitations/merci/confirmation.tsx', import.meta.url), 'utf8');
  assert.match(component, /state === 'ready'/);
  assert.match(component, /batches\/\$\{encodeURIComponent\(batch!\.id\)\}\/download/);
  assert.doesNotMatch(component, /method: 'POST'|localStorage|sessionStorage/);
});
