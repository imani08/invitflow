import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseDesignEvent } from './design-event-contract.mjs';

const designPage = new URL('../app/events/[eventId]/designs/page.tsx', import.meta.url);
const designWorkspace = new URL('../app/events/[eventId]/designs/workspace.tsx', import.meta.url);
const composerPath = new URL('../components/AIComposer.tsx', import.meta.url);

test('design route rejects malformed ceremony contracts and preserves valid empty/simple events', async () => {
  const page = await readFile(designPage, 'utf8');
  const workspace = await readFile(designWorkspace, 'utf8');
  assert.match(page, /parseDesignEvent\(payload\)/);
  const event = { id: 'event-1', name: 'Célébration', status: 'DRAFT', timezone: 'Africa/Kinshasa', ceremonies: [] };
  assert.equal(parseDesignEvent(event), event);
  for (const ceremonies of [undefined, null, {}, [null], [{ id: 'c' }]]) assert.throws(() => parseDesignEvent({ ...event, ceremonies }), /incomplètes/);
  assert.doesNotMatch(workspace, /event = \{ \.\.\.event, ceremonies:/);
});

test('invalid design catalog responses show a recoverable error instead of reaching array rendering', async () => {
  const workspace = await readFile(designWorkspace, 'utf8');
  assert.match(workspace, /if \(!Array\.isArray\(templateResponse\.items\) \|\| !Array\.isArray\(designResponse\.items\)\) throw new Error/);
  assert.match(workspace, /catch \(error\) \{ setCatalogError/);
});

test('AI Composer handles unavailable routes and non-Error response payloads visibly', async () => {
  const composer = await readFile(composerPath, 'utf8');
  assert.match(composer, /response\.status === 404[\s\S]*Gateway/);
  assert.match(composer, /errorMessage\(reason, 'Propositions indisponibles\.'\)/);
  assert.match(composer, /const ceremonies = Array\.isArray\(event\.ceremonies\) \? event\.ceremonies : \[\]/);
});
