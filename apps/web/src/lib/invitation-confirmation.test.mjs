import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { confirmationState, generationMessage } from './invitation-confirmation.mjs';

test('generation messages follow state and never announce unfunded downloads', () => {
  const batch = { status: 'QUEUED', completedItems: 0, failedItems: 0 };
  assert.equal(generationMessage(batch), 'Votre demande est enregistrée. La préparation de vos invitations va commencer.');
  assert.equal(generationMessage({ ...batch, status: 'GENERATING' }), 'Vos invitations sont en cours de préparation.');
  assert.match(generationMessage({ ...batch, status: 'FAILED' }), /a échoué.*réessayez/);
  assert.doesNotMatch(generationMessage({ ...batch, status: 'COMPLETED', completedItems: 1 }), /sont prêtes|gratuitement/);
  const funded = { ...batch, status: 'COMPLETED', completedItems: 1, settledAt: '2026-10-12', settlementCredits: 1 };
  assert.equal(generationMessage(funded), 'Vos invitations sont prêtes. Vous pouvez les télécharger à nouveau gratuitement.');
  assert.match(generationMessage({ ...funded, status: 'PARTIAL', failedItems: 2 }), /1 invitation\(s\) disponible\(s\), 2 invitation\(s\) à reprendre/);
  assert.doesNotMatch(generationMessage({ ...funded, zipDeletedAt: '2026-10-12' }), /sont prêtes|gratuitement/);
});

test('confirmation requires a real completed unexpired batch, not a download click', () => {
  assert.equal(confirmationState(null), 'unavailable');
  assert.equal(confirmationState({ status: 'COMPLETED' }), 'failed');
  assert.equal(confirmationState({ status: 'FINALIZING' }), 'pending');
  assert.equal(confirmationState({ status: 'PARTIAL', settledAt: '2026-10-11', settlementCredits: 2 }), 'ready');
  for (const status of ['RESERVING', 'QUEUED', 'GENERATING']) assert.equal(confirmationState({ status }), 'pending');
  for (const status of ['FAILED', 'CANCELLED']) assert.equal(confirmationState({ status }), 'failed');
  assert.equal(confirmationState({ settledAt: '2026-10-11', settlementCredits: 1, status: 'COMPLETED' }), 'ready');
  assert.equal(confirmationState({ settledAt: '2026-10-11', settlementCredits: 1, status: 'COMPLETED', zipDeletedAt: 'date' }), 'expired');
  assert.equal(confirmationState({ settledAt: '2026-10-11', settlementCredits: 1, status: 'COMPLETED', zipExpiresAt: 'invalid' }), 'expired');
  assert.equal(confirmationState({ settledAt: '2026-10-11', settlementCredits: 1, status: 'COMPLETED', zipExpiresAt: '2026-01-01' }, Date.parse('2026-01-02')), 'expired');
  assert.equal(confirmationState({ settledAt: '2026-10-11', settlementCredits: 1, status: 'COMPLETED', zipExpiresAt: '2026-01-03' }, Date.parse('2026-01-02')), 'ready');
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
