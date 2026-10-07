import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../../app/admin/', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('admin routes share one shell and navigation with role-filtered modules', async () => {
  const [layout, shell, navigation, pages] = await Promise.all([
    read('layout.tsx'),
    read('../../components/admin/admin-shell.tsx'),
    read('../../components/admin/admin-navigation.tsx'),
    Promise.all(['page.tsx', 'analytics/page.tsx', 'finance/page.tsx', 'partners/page.tsx', 'pricing/page.tsx', 'storage/page.tsx'].map(read)),
  ]);
  assert.match(layout, /<AdminShell roles=\{roles\}>/);
  assert.match(shell, /admin-app/);
  assert.match(navigation, /BrandLogo variant="compact" href="\/admin"/);
  assert.match(navigation, /item\.roles\.some\(\(role\) => roles\.includes\(role\)\)/);
  assert.match(navigation, /SUPPORT_ADMIN/);
  assert.match(navigation, /FINANCE_ADMIN/);
  for (const page of pages) assert.doesNotMatch(page, /BrandLogo variant="compact"\s*\/>|BrandLogo variant="compact" href="\/"/);
  assert.match(pages.join('\n'), /decodeJwt\(session\.accessToken\)/);
  assert.match(pages.join('\n'), /\/api\/auth\/login\?returnTo=/);
});

test('admin shell styles use semantic theme tokens and responsive keyboard-friendly controls', async () => {
  const css = await read('admin.css');
  assert.match(css, /var\(--text-primary\)/);
  assert.match(css, /var\(--text-secondary\)/);
  assert.match(css, /var\(--surface-elevated\)/);
  assert.match(css, /var\(--input-placeholder\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /max-width: 760px/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});

test('admin navigation keeps overview active without marking its anchor links active', async () => {
  const navigation = await read('../../components/admin/admin-navigation.tsx');
  assert.match(navigation, /!item\.href\.includes\('#'\) && currentPath === href/);
});
