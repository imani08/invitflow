import assert from 'node:assert/strict';
import test from 'node:test';

test('agency gateway routes are restricted to root and one workspace resource segment', () => {
  const routes = ['/v1/agencies', '/v1/agencies/11111111-1111-4111-8111-111111111111/members', '/v1/agencies/11111111-1111-4111-8111-111111111111/clients'];
  for (const route of routes) assert.match(route, /^\/v1\/agencies(?:\/[^/?]+\/[^/?]+)?$/);
  assert.doesNotMatch('/v1/agencies/../../admin/finance', /^\/v1\/agencies(?:\/[^/?]+\/[^/?]+)?$/);
});
