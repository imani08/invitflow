import assert from 'node:assert/strict';
import test from 'node:test';
import { isExpectedOrigin } from './same-origin.mjs';

test('accepts the configured HTTP or HTTPS origin exactly', () => {
  assert.equal(isExpectedOrigin('https://invitaflow.example', 'https://invitaflow.example'), true);
  assert.equal(isExpectedOrigin('http://localhost:3000', 'http://localhost:3000'), true);
});

test('rejects absent, cross-site, malformed, opaque and path-bearing origins', () => {
  for (const origin of [null, 'https://attacker.example', 'null', 'not-a-url', 'https://app.example/path']) {
    assert.equal(isExpectedOrigin(origin, 'https://app.example'), false);
  }
});

test('rejects an invalid configured origin', () => {
  assert.equal(isExpectedOrigin('https://app.example', 'app.example'), false);
});
