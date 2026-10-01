import assert from 'node:assert/strict';
import { test } from 'node:test';
import { invitationIdFromToken, invitationToken } from './invitation-token.mjs';

const id = 'b6aa230e-c500-4d75-b078-869c7731155d';
const secret = 'test-only-signing-secret';

test('signed invitation tokens round-trip without exposing guest data', () => {
  const token = invitationToken(id, secret);
  assert.equal(invitationIdFromToken(token, secret), id);
  assert.equal(token.includes('@'), false);
});

test('invalid, altered and wrong-secret tokens are rejected', () => {
  const token = invitationToken(id, secret);
  assert.equal(invitationIdFromToken(`${token.slice(0, -1)}x`, secret), null);
  assert.equal(invitationIdFromToken(token, 'a-different-secret'), null);
  assert.equal(invitationIdFromToken(`${token}.extra`, secret), null);
  assert.equal(invitationIdFromToken('short', secret), null);
});

test('token creation rejects non-UUID identifiers', () => {
  assert.throws(() => invitationToken('not-an-id', secret), /Invalid invitation id/);
});
