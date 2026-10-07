import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(appRoot, '../..');

test('every legal manifest route has a bundled source document and one shared operator contact', async () => {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'packages/legal-contract/legal-manifest.json'), 'utf8'));
  const files = new Set(await readdir(path.join(appRoot, 'content/legal')));
  assert.equal(manifest.version, '1.0');
  assert.equal(manifest.operator, 'FOCUS HD ENTREPRISES');
  assert.deepEqual(manifest.contact, { email: 'fucushd098@gmail.com', phone: '+243973431495' });
  for (const document of manifest.documents) {
    assert.match(document.slug, /^\/(legal\/[-a-z]+|contact)$/);
    assert.ok(files.has(document.file), `missing source: ${document.file}`);
    const source = await readFile(path.join(appRoot, 'content/legal', document.file), 'utf8');
    assert.match(source, /version: "1\.0"/);
  }
});

test('contact source links directly to the configured email and phone', async () => {
  const contact = await readFile(path.join(appRoot, 'content/legal/contact.md'), 'utf8');
  assert.match(contact, /mailto:fucushd098@gmail\.com/);
  assert.match(contact, /tel:\+243973431495/);
});
