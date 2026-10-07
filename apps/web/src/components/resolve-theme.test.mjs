import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveInitialTheme } from './resolve-theme.mjs';

test('defaults to light when there is no saved theme preference', () => {
  assert.equal(resolveInitialTheme(null), 'light');
});

test('defaults to light when the saved theme value is invalid', () => {
  assert.equal(resolveInitialTheme('system'), 'light');
});

test('keeps an explicitly saved light or dark preference', () => {
  assert.equal(resolveInitialTheme('light'), 'light');
  assert.equal(resolveInitialTheme('dark'), 'dark');
});
