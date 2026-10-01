import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContentSecurityPolicy } from './csp-policy.mjs';

test('builds a production policy with a nonce and denies unsafe script sources', () => {
  const policy = buildContentSecurityPolicy('MTIzNDU2Nzg5MDEyMzQ1Ng==');
  assert.match(policy, /script-src 'self' 'nonce-MTIzNDU2Nzg5MDEyMzQ1Ng==' 'strict-dynamic'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.doesNotMatch(policy, /script-src[^;]*(?:unsafe-inline|unsafe-eval)/);
});

test('allows development hot reload without weakening production policy', () => {
  const policy = buildContentSecurityPolicy('YWJjMTIz', true);
  assert.match(policy, /'unsafe-eval'/);
  assert.match(policy, /connect-src 'self' ws: wss:/);
});

test('rejects non-base64 nonce input', () => {
  assert.throws(() => buildContentSecurityPolicy('bad nonce'), TypeError);
});
