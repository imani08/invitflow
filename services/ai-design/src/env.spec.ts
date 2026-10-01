import assert from 'node:assert/strict';
import test from 'node:test';
import { aiJobLimits } from './env.js';

test('AI job limits default to conservative owner, global and hourly quotas', () => {
  const names = ['AI_MAX_ACTIVE_PER_OWNER', 'AI_MAX_ACTIVE_GLOBAL', 'AI_MAX_REQUESTS_PER_HOUR_PER_OWNER'] as const;
  const previous = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    assert.deepEqual(aiJobLimits(), { activePerOwner: 2, activeGlobal: 20, requestsPerHourPerOwner: 10 });
    process.env['AI_MAX_ACTIVE_PER_OWNER'] = '4';
    process.env['AI_MAX_ACTIVE_GLOBAL'] = '80';
    process.env['AI_MAX_REQUESTS_PER_HOUR_PER_OWNER'] = '25';
    assert.deepEqual(aiJobLimits(), { activePerOwner: 4, activeGlobal: 80, requestsPerHourPerOwner: 25 });
  } finally {
    names.forEach((name, index) => previous[index] === undefined ? delete process.env[name] : process.env[name] = previous[index]);
  }
});

test('AI job limits reject invalid values instead of silently disabling protection', () => {
  const previous = process.env['AI_MAX_ACTIVE_PER_OWNER'];
  try {
    process.env['AI_MAX_ACTIVE_PER_OWNER'] = '0';
    assert.throws(() => aiJobLimits(), /AI_MAX_ACTIVE_PER_OWNER/);
    process.env['AI_MAX_ACTIVE_PER_OWNER'] = '2.5';
    assert.throws(() => aiJobLimits(), /AI_MAX_ACTIVE_PER_OWNER/);
    process.env['AI_MAX_ACTIVE_PER_OWNER'] = '101';
    assert.throws(() => aiJobLimits(), /AI_MAX_ACTIVE_PER_OWNER/);
  } finally {
    if (previous === undefined) delete process.env['AI_MAX_ACTIVE_PER_OWNER'];
    else process.env['AI_MAX_ACTIVE_PER_OWNER'] = previous;
  }
});
