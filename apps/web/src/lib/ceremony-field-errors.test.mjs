import assert from 'node:assert/strict';
import test from 'node:test';
import { ceremonyFieldErrors, CEREMONY_TIME_RANGE_ERROR } from './ceremony-time-range.mjs';
test('server errors are attributed only to known moment fields',()=>{
  const errors=ceremonyFieldErrors('startAt local time and UTC offset must match timezone. capacity must be positive');
  assert.match(errors.startAt,/date/);assert.match(errors.capacity,/capacité/);assert.equal(errors.timezone,undefined);
  assert.equal(ceremonyFieldErrors('endAt must be after startAt').endAt,CEREMONY_TIME_RANGE_ERROR);
  assert.deepEqual(ceremonyFieldErrors('Le service est indisponible.'),{});
});
