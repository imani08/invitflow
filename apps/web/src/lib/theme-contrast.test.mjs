import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');

function token(name, value) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(css, new RegExp(`${escapedName}\\s*:\\s*${escapedValue}(?:;|\\s)`));
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test('dark theme defines semantic readable foreground, surface, border and input tokens', () => {
  token('--text-primary', '#f7f4f0');
  token('--text-secondary', '#d8d1ca');
  token('--text-muted', '#aaa29b');
  token('--surface', '#1d1820');
  token('--surface-elevated', '#29222d');
  token('--border', '#52465a');
  token('--input-text', '#f7f4f0');
  token('--input-placeholder', '#aaa29b');
});

test('dark semantic text tokens meet WCAG AA against workspace and elevated surfaces', () => {
  for (const foreground of ['#f7f4f0', '#d8d1ca', '#aaa29b']) {
    for (const background of ['#1d1820', '#29222d', '#211b25']) {
      assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} has contrast ${contrast(foreground, background).toFixed(2)}`);
    }
  }
});

test('dark semantic links and status colors retain accessible contrast on their surfaces', () => {
  for (const [foreground, background] of [
    ['#dfbd7d', '#29222d'],
    ['#a8d5a1', '#26352b'],
    ['#f1d598', '#3c3326'],
    ['#ffaaa9', '#3b2028'],
  ]) {
    assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} has contrast ${contrast(foreground, background).toFixed(2)}`);
  }
});

test('authenticated dark overrides cover requested workspaces and protect artwork', () => {
  for (const selector of ['.events-shell', '.wallet-page', '.report-shell', '.notifications-page', '.design-page', '.invitation-workspace', '.seating-page']) assert.ok(css.includes(selector));
  assert.match(css, /:not\(\.design-canvas \*\)/);
  assert.match(css, /:not\(\.invitation-preview \*\)/);
});
