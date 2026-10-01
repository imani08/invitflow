import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContentSecurityPolicy } from './csp-policy.mjs';

test('builds a nonce based production CSP without unsafe script directives', () => {
  const policy = buildContentSecurityPolicy('YWJjMTIz');
  assert.match(policy, /script-src 'self' 'nonce-YWJjMTIz' 'strict-dynamic'/);
  assert.doesNotMatch(policy, /script-src[^;]*(?:unsafe-inline|unsafe-eval)/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
});

test('allows development hot reload exceptions only in development', () => {
  const policy = buildContentSecurityPolicy('YWJjMTIz', true);
  assert.match(policy, /'unsafe-eval'/);
  assert.match(policy, /connect-src 'self' ws: wss:/);
});

test('rejects an invalid nonce', () => {
  assert.throws(() => buildContentSecurityPolicy('not a nonce'), TypeError);
});
