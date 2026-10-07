import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDefaultPostLoginDestination, notificationMobileItem, uniqueNavigationItems } from './app-navbar-items.mjs';

test('mobile home navigation is first and resolves to the application root', () => {
  const items = uniqueNavigationItems([
    { href: '/', label: 'Accueil', icon: 'home' },
    { href: '/events', label: 'Invités', icon: 'guests' },
  ]);
  assert.equal(items[0]?.href, '/');
  assert.equal(items[0]?.icon, 'home');
  assert.equal(items.filter((item) => item.href === '/').length, 1);
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
