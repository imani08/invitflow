import assert from 'node:assert/strict';
import test from 'node:test';
import { createDraftSaveQueue } from './draft-save-queue.mjs';
import { handleJourneyDraft } from './journey-draft-handler.mjs';
import { journeyDestination, validateDraft } from './journey-draft-policy.mjs';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('all six journey steps have internal resumable Wallet destinations', () => {
  for (const path of [`/events/${id}`, `/events?event=${id}#ceremony-${id}`, `/events/${id}/designs`, `/events/${id}/guests`, `/events/${id}/invitations`, `/events/${id}/invitations/merci?batch=${id}`]) {
    assert.equal(journeyDestination(path)?.eventId, id);
    assert.equal(journeyDestination(path)?.path, path);
  }
  for (const value of ['https://evil.example', '//evil.example', '/\\evil', '/events%2f..', '/events\n', `/events/${id}/../../../account`, '/api/auth/logout', '/events?returnTo=https://evil.example', '/events?event=not-uuid']) assert.equal(journeyDestination(value), null, value);
});
test('incomplete drafts accept empty titles/dates without weakening final validation', () => {
  assert.deepEqual(validateDraft({ name: '', startAt: '', description: 'Texte en cours', selection: [] }), { name: '', startAt: '', description: 'Texte en cours', selection: [] });
  for (const value of [{ accessToken: 'secret' }, { password: 'secret' }, JSON.parse('{"__proto__":{}}')]) assert.throws(() => validateDraft(value));
});
test('save queue serializes/coalesces edits and never acknowledges an unsaved newer value', async () => {
  let resolveFirst; const calls = [], statuses = [];
  const queue = createDraftSaveQueue({ onStatus: status => statuses.push(status), save: async (revision, data) => { calls.push({ revision, data }); if (calls.length === 1) await new Promise(resolve => { resolveFirst = resolve; }); return { revision: revision + 1, data }; } });
  queue.initialize({ revision: 2, data: {} }); queue.change({ text: 'ancien' });
  const first = queue.flush(); queue.change({ text: 'récent', design: { id, version: 3 } });
  const second = queue.flush(); assert.equal(calls.length, 1); assert.equal(queue.dirty(), true);
  resolveFirst(); await Promise.all([first, second]);
  assert.deepEqual(calls, [{ revision: 2, data: { text: 'ancien' } }, { revision: 3, data: { text: 'récent', design: { id, version: 3 } } }]);
  assert.equal(queue.dirty(), false); assert.equal(statuses.at(-1), 'saved');
});
test('unchanged restored draft does not remain stuck on saving', async () => {
  const statuses = []; let saves = 0;
  const queue = createDraftSaveQueue({ onStatus: value => statuses.push(value), save: async () => { saves++; } });
  queue.initialize({ revision: 3, data: { progress: '/events' } });
  queue.change({ progress: '/events' }); await queue.flush();
  assert.equal(saves, 0); assert.equal(statuses.at(-1), 'saved');
});

test('failed save retains local edits and blocks navigation until retry succeeds', async () => {
  let fail = true, navigated = false;
  const queue = createDraftSaveQueue({ onStatus() {}, save: async (revision, data) => { if (fail) throw new Error('indisponible'); return { revision: revision + 1, data }; } });
  queue.initialize({ revision: 0, data: {} }); queue.change({ text: 'conservé', guests: [id] });
  await assert.rejects(queue.flush().then(() => { navigated = true; }), /indisponible/);
  assert.equal(navigated, false); assert.equal(queue.dirty(), true);
  fail = false; await queue.flush(); assert.equal(queue.dirty(), false);
});
test('production draft HTTP handler: owner isolation, partial save, reload, CAS and event access', async () => {
  const records = new Map(); let owner = 'owner-a', access = 200;
  const dependencies = { origin: 'http://localhost:3000', owner: async () => owner, eventAccess: async () => access,
    read: async (subject, scope) => records.get(subject + scope) ?? { revision: 0, data: {} },
    save: async (subject, scope, revision, data) => { const key = subject + scope, old = records.get(key); if ((old?.revision ?? 0) !== revision) return null; const next = { revision: revision + 1, data }; records.set(key, next); return next; } };
  const url = 'http://localhost:3000/api/journey-draft?path=' + encodeURIComponent(`/events/${id}/designs`);
  const put = (revision, data, origin = dependencies.origin) => handleJourneyDraft(new Request(url, { method: 'PUT', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ revision, data }) }), dependencies);
  const data = { title: '', design: { id, version: 4, document: { text: 'Personnalisation' } }, guests: [id], step: 3 };
  assert.equal((await put(0, data)).status, 200);
  let response = await handleJourneyDraft(new Request(url), dependencies);
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.deepEqual((await response.json()).data, data);
  assert.equal((await put(0, { text: 'ancien' })).status, 409);
  assert.equal((await put(1, data, 'https://evil.example')).status, 403);
  owner = 'owner-b'; assert.deepEqual((await (await handleJourneyDraft(new Request(url), dependencies)).json()).data, {});
  access = 403; assert.equal((await put(0, data)).status, 403);
  owner = null; assert.equal((await put(0, data)).status, 401);
});
test('draft HTTP storage failure is explicit, no fabricated successful save', async () => {
  const response = await handleJourneyDraft(new Request('http://localhost:3000/api/journey-draft?path=/events'), { origin: 'http://localhost:3000', owner: async () => 'owner', read: async () => { throw new Error('secret should not leak'); } });
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /secret should not leak/);
});
