import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('all event, ceremony and program datetime writes use the offset-aware converter', async () => {
  const workspace = await readFile(new URL('./workspace.tsx', import.meta.url), 'utf8');
  assert.equal([...workspace.matchAll(/localTimeInZone\(/g)].length, 10);
});

test('event API errors preserve safe Nest message strings and validation arrays', async () => {
  const workspace = await readFile(new URL('./workspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /typeof message === 'string' \? message : Array\.isArray\(message\)/);
  assert.match(workspace, /message\.filter\(\(part\): part is string => typeof part === 'string'\)\.join\(' '\)/);
  assert.doesNotMatch(workspace, /\.stack/);
});
