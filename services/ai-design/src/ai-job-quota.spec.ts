import assert from 'node:assert/strict';
import test from 'node:test';
import { aiActiveQuotaRejection, aiQuotaRejection } from './ai-job-quota.js';

const limits = { activePerOwner: 2, activeGlobal: 20, requestsPerHourPerOwner: 10 };

test('allows a request below every configured AI quota', () => {
  assert.equal(aiQuotaRejection({ activeOwner: 1, activeGlobal: 19, requestsLastHour: 9 }, limits), null);
});

test('rejects requests at owner concurrency, global concurrency and hourly rate limits', () => {
  assert.equal(aiQuotaRejection({ activeOwner: 2, activeGlobal: 2, requestsLastHour: 2 }, limits), 'OWNER_ACTIVE');
  assert.equal(aiQuotaRejection({ activeOwner: 1, activeGlobal: 20, requestsLastHour: 2 }, limits), 'GLOBAL_ACTIVE');
  assert.equal(aiQuotaRejection({ activeOwner: 1, activeGlobal: 19, requestsLastHour: 10 }, limits), 'OWNER_RATE');
});

test('retry capacity checks ignore the creation rate while enforcing concurrency', () => {
  assert.equal(aiActiveQuotaRejection({ activeOwner: 1, activeGlobal: 19 }, limits), null);
  assert.equal(aiActiveQuotaRejection({ activeOwner: 2, activeGlobal: 19 }, limits), 'OWNER_ACTIVE');
});
