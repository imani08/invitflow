import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function pngSize(path) {
  const image = await readFile(new URL(path, import.meta.url));
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
}

test('brand artwork has separate horizontal and square app assets at declared sizes', async () => {
  const logo = await pngSize('../..//public/brand/invitaflow-logo.png');
  const icon = await pngSize('../../public/brand/invitaflow-icon.png');
  const favicon = await pngSize('../app/icon.png');
  const apple = await pngSize('../app/apple-icon.png');
  assert.ok(logo.width > logo.height * 2);
  assert.deepEqual(icon, { width: 512, height: 512 });
  assert.deepEqual(favicon, { width: 64, height: 64 });
  assert.deepEqual(apple, { width: 180, height: 180 });
});

test('favicon.ico packages the existing official InvitaFlow app icon', async () => {
  const favicon = await readFile(new URL('../app/favicon.ico', import.meta.url));
  const icon = await readFile(new URL('../app/icon.png', import.meta.url));
  assert.equal(favicon.readUInt16LE(0), 0);
  assert.equal(favicon.readUInt16LE(2), 1);
  assert.equal(favicon.readUInt16LE(4), 1);
  assert.equal(favicon.readUInt32LE(14), icon.length);
  assert.deepEqual(favicon.subarray(22), icon);
});

test('shared logo component includes accessible full, compact and icon variants', async () => {
  const component = await readFile(new URL('./brand-logo.tsx', import.meta.url), 'utf8');
  assert.match(component, /variant\?: 'full' \| 'compact' \| 'icon'/);
  assert.match(component, /alt="InvitaFlow"/);
  assert.match(component, /<source media="\(max-width: 600px\)"/);
  const landing = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(landing, /<BrandLogo priority className="home-brand"/);
});

test('brand metadata and responsive/reduced-motion tokens are present', async () => {
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  const manifest = await readFile(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8');
  assert.match(layout, /applicationName: 'InvitaFlow'/);
  assert.match(layout, /openGraph:/);
  assert.match(manifest, /"short_name": "InvitaFlow"/);
  assert.match(css, /max-width:760px/);
  assert.match(css, /max-width:600px/);
  assert.match(css, /prefers-reduced-motion/);
});

test('authenticated admin pages give compact logos an explicit dashboard destination', async () => {
  const pages = [
    '../app/admin/page.tsx',
    '../app/admin/analytics/page.tsx',
    '../app/admin/finance/page.tsx',
    '../app/admin/partners/page.tsx',
    '../app/admin/pricing/page.tsx',
    '../app/admin/storage/page.tsx',
  ];
  for (const page of pages) {
    const source = await readFile(new URL(page, import.meta.url), 'utf8');
    for (const match of source.matchAll(/<BrandLogo\b([^>]*)>/g)) {
      if (!/\bvariant="compact"/.test(match[1])) continue;
      assert.match(match[1], /\bhref="\/dashboard"/, `${page} compact logo must link to /dashboard`);
      assert.doesNotMatch(match[1], /\bhref="\/"/);
    }
  }
});
