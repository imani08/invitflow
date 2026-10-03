import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldBlockLargeStorageOperation, storageLevel } from './storage-policy.mjs';

test('maps disk usage to configured capacity levels and blocks only emergency writes', () => {
  assert.equal(storageLevel(69.9), 'NORMAL');
  assert.equal(storageLevel(70), 'WARNING');
  assert.equal(storageLevel(80), 'SERIOUS');
  assert.equal(storageLevel(90), 'CRITICAL');
  assert.equal(storageLevel(95), 'EMERGENCY');
  assert.equal(shouldBlockLargeStorageOperation(94.99), false);
  assert.equal(shouldBlockLargeStorageOperation(95), true);
});

test('rejects malformed threshold order instead of silently using it', () => {
  assert.throws(() => storageLevel(80, { warning: 80, serious: 70, critical: 90, emergency: 95 }), /increasing percentages/);
});
