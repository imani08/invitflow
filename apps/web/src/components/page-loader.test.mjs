import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const loader = await readFile(new URL('./page-loader.tsx', import.meta.url), 'utf8');
const loading = await readFile(new URL('../app/loading.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

test('global loading state uses InvitaFlow branding, French accessible status, theme tokens and reduced motion', () => {
  assert.match(loading, /<PageLoader fullScreen \/>/);
  assert.match(loader, /role="status" aria-live="polite"/);
  assert.match(loader, /Préparation de votre espace/);
  assert.match(loader, /BrandLogo/);
  assert.match(css, /\.if-page-loader--screen/);
  assert.match(css, /var\(--surface\)/);
  assert.match(css, /var\(--brand-gold\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
