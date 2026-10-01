import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCapacity, occupancyAfterAssignment } from './capacity-policy.js';

test('calculates occupancy for new assignments and moves within the same target', () => {
  assert.equal(occupancyAfterAssignment(6, 0, 2), 8);
  assert.equal(occupancyAfterAssignment(6, 2, 4), 8);
});

test('rejects capacity overflow while allowing unlimited zones', () => {
  assert.equal(assertCapacity(8, 8), undefined);
  assert.equal(assertCapacity(null, 200), undefined);
  assert.throws(() => assertCapacity(8, 9), /capacité.*dépassée/i);
});

test('rejects invalid occupancy inputs instead of hiding over-capacity data', () => {
  assert.throws(() => occupancyAfterAssignment(2, 3, 1), /Invalid seating occupancy/);
  assert.throws(() => occupancyAfterAssignment(2, 0, 0), /Invalid seating occupancy/);
});
