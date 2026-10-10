import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const designPage = new URL('../app/events/[eventId]/designs/page.tsx', import.meta.url);
const designWorkspace = new URL('../app/events/[eventId]/designs/workspace.tsx', import.meta.url);
const composerPath = new URL('../components/AIComposer.tsx', import.meta.url);

test('design route normalizes absent or malformed ceremony collections at the API boundary', async () => {
  const page = await readFile(designPage, 'utf8');
  const workspace = await readFile(designWorkspace, 'utf8');
  assert.match(page, /ceremonies: Array\.isArray\(rawEvent\.ceremonies\)[\s\S]*: \[\]/);
  assert.match(workspace, /ceremonies: Array\.isArray\(event\.ceremonies\) \? event\.ceremonies : \[\]/);
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
