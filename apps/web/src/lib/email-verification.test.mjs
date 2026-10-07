import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const auth = await readFile(new URL('./auth-session.ts', import.meta.url), 'utf8');
const callback = await readFile(new URL('../app/api/auth/callback/route.ts', import.meta.url), 'utf8');

test('a verified nonempty email claim is required to create a web session', () => {
  assert.match(auth, /payload\['email'\]\s*===\s*'string'/);
  assert.match(auth, /payload\['email_verified'\]\s*===\s*true/);
  assert.match(auth, /if \(!isVerifiedEmailClaim\(payload\)\) throw new EmailVerificationRequiredError\(\)/);
  assert.match(callback, /auth=verification-required/);
});
