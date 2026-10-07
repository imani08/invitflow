import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { getDefaultPostLoginDestination, notificationMobileItem, uniqueNavigationItems } from './app-navbar-items.mjs';

const appNavbar = await readFile(new URL('./AppNavbar.tsx', import.meta.url), 'utf8');
const brandLogo = await readFile(new URL('./brand-logo.tsx', import.meta.url), 'utf8');

test('authenticated mobile home navigation resolves to the dashboard', () => {
  const items = uniqueNavigationItems([
    { href: '/dashboard', label: 'Accueil', icon: 'home' },
    { href: '/events', label: 'Invités', icon: 'guests' },
  ]);
  assert.equal(items[0]?.href, '/dashboard');
  assert.equal(items[0]?.icon, 'home');
  assert.equal(items.filter((item) => item.href === '/dashboard').length, 1);
  assert.match(appNavbar, /\{ href: '\/dashboard', label: 'Accueil', icon: 'home' as const \}/);
  assert.match(appNavbar, /app-sidebar-brand"><BrandLogo variant="compact" href="\/dashboard" \/>/);
  assert.match(appNavbar, /app-mobile-topbar"><BrandLogo variant="compact" href="\/dashboard" \/>/);
  assert.match(appNavbar, /mobileActive\(item\.href\) \? 'is-active' : ''/);
});

test('public BrandLogo remains explicitly overridable and defaults to the public home', () => {
  assert.match(brandLogo, /href = '\/'/);
  assert.match(appNavbar, /BrandLogo variant="compact" href="\/dashboard"/);
});

test('mobile navigation deterministically deduplicates Alertes by semantic route and label', () => {
  const items = uniqueNavigationItems([
    { href: '/events', label: 'Événements', icon: 'events' },
    notificationMobileItem,
    { href: '/events#create-event', label: 'Créer', icon: 'create', primary: true },
    notificationMobileItem,
    { href: '/account', label: 'Compte', icon: 'account' },
  ]);

  assert.equal(items.filter((item) => item.href === '/account/notifications' && item.label === 'Alertes').length, 1);
  assert.deepEqual(items.map(({ href, label }) => `${href}:${label}`), [
    '/events:Événements',
    '/account/notifications:Alertes',
    '/events#create-event:Créer',
    '/account:Compte',
  ]);
});

test('post-login destination defaults to dashboard and keeps only safe local return paths', () => {
  assert.equal(getDefaultPostLoginDestination(null), '/dashboard');
  assert.equal(getDefaultPostLoginDestination(undefined), '/dashboard');
  assert.equal(getDefaultPostLoginDestination(''), '/dashboard');
  assert.equal(getDefaultPostLoginDestination('https://evil.example'), '/dashboard');
  assert.equal(getDefaultPostLoginDestination('//evil.example'), '/dashboard');
  assert.equal(getDefaultPostLoginDestination('/\\evil.example'), '/dashboard');
  assert.equal(getDefaultPostLoginDestination('/account/wallet'), '/account/wallet');
  assert.equal(getDefaultPostLoginDestination('/events?view=upcoming'), '/events?view=upcoming');
});
