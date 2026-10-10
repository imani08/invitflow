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

test('defaults connect-src to self and normalizes storage URLs to their origin', () => {
  const nonce = 'YWJjMTIz';
  const defaultPolicy = buildContentSecurityPolicy(nonce);
  assert.match(defaultPolicy, /connect-src 'self'(?:;|$)/);

  const policy = buildContentSecurityPolicy(nonce, true, ['http://localhost:9000/media-quarantine']);
  assert.match(policy, /connect-src 'self' http:\/\/localhost:9000 ws: wss:/);
  assert.doesNotMatch(policy, /connect-src[^;]*media-quarantine/);
  assert.doesNotMatch(policy, /connect-src[^;]*\*/);
});

test('rejects unsafe, credentialed, query-bearing and hash-bearing connect URLs', () => {
  const nonce = 'YWJjMTIz';
  for (const origin of [
    'javascript:alert(1)', 'file:///tmp/uploads', 'data:text/plain,upload',
    'http://user:pass@localhost:9000', 'https://storage.example.test?bucket=media',
    'https://storage.example.test#uploads', 'https://*.example.test',
  ]) {
    assert.throws(() => buildContentSecurityPolicy(nonce, false, [origin]), TypeError, origin);
  }
});

test('rejects non-base64 nonce input', () => {
  assert.throws(() => buildContentSecurityPolicy('bad nonce'), TypeError);
});
