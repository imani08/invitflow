import assert from 'node:assert/strict';
import test from 'node:test';
import { emissionRequestHash, finalBatchStatus, isFundedBatch } from './emission-policy.mjs';
test('idempotency binds exact emission intent including ALL versus explicit subset and design version', () => {
  const hash = (guests, version = 3) => emissionRequestHash('event', 'design', version, guests);
  assert.equal(hash(['a', 'b', 'a']), hash(['b', 'a']));
  assert.notEqual(hash([]), hash(['a', 'b'])); assert.notEqual(hash(['a']), hash(['a'], 4));
});
test('terminal status alone is never financial proof; partial/cancelled successes require settlement', () => {
  for (const status of ['COMPLETED', 'PARTIAL', 'CANCELLED']) {
    assert.equal(isFundedBatch({ status }), false);
    assert.equal(isFundedBatch({ status, settledAt: new Date(), settlementCredits: 1 }), true);
  }
  for (const status of ['FINALIZING', 'GENERATING', 'FAILED', 'RESERVING']) assert.equal(isFundedBatch({ status, settledAt: new Date(), settlementCredits: 1 }), false);
  assert.equal(finalBatchStatus(2, 3, false), 'PARTIAL'); assert.equal(finalBatchStatus(0, 3, false), 'FAILED');
  assert.equal(finalBatchStatus(3, 3, false), 'COMPLETED'); assert.equal(finalBatchStatus(2, 3, true), 'CANCELLED');
});
