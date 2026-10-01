import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DELETE_SESSION_IF_UNCHANGED, deleteSessionIfUnchanged, REPLACE_SESSION_IF_UNCHANGED, replaceSessionIfUnchanged, RELEASE_REFRESH_LOCK_IF_OWNER, releaseRefreshLock, waitForSessionChange } from './session-refresh.mjs';

class RedisStoreFake {
  value = null;
  ttl = null;
  lock = null;

  async eval(script, { keys, arguments: args }) {
    assert.equal(keys.length, 1);
    if (script === REPLACE_SESSION_IF_UNCHANGED) {
      if (this.value !== args[0]) return 0;
      this.value = args[1];
      this.ttl = Number(args[2]);
      return 1;
    }
    if (script === DELETE_SESSION_IF_UNCHANGED) {
      if (this.value !== args[0]) return 0;
      this.value = null;
      this.ttl = null;
      return 1;
    }
    assert.equal(script, RELEASE_REFRESH_LOCK_IF_OWNER);
    if (this.lock !== args[0]) return 0;
    this.lock = null;
    return 1;
  }
}

test('a stale refresh cannot overwrite a newer session value', async () => {
  const redis = new RedisStoreFake();
  redis.value = 'newer-refreshed-session';
  assert.equal(await replaceSessionIfUnchanged(redis, 'session:key', 'old-session', 'stale-refresh', 28800), false);
  assert.equal(redis.value, 'newer-refreshed-session');
});

test('successful refresh replaces only the value it read and resets the session TTL', async () => {
  const redis = new RedisStoreFake();
  redis.value = 'old-session';
  assert.equal(await replaceSessionIfUnchanged(redis, 'session:key', 'old-session', 'fresh-session', 28800), true);
  assert.equal(redis.value, 'fresh-session');
  assert.equal(redis.ttl, 28800);
});

test('a stale refresh failure cannot delete another request’s valid session', async () => {
  const redis = new RedisStoreFake();
  redis.value = 'newer-refreshed-session';
  assert.equal(await deleteSessionIfUnchanged(redis, 'session:key', 'old-session'), false);
  assert.equal(redis.value, 'newer-refreshed-session');
});

test('refresh failure deletes the session only when its original value remains stored', async () => {
  const redis = new RedisStoreFake();
  redis.value = 'old-session';
  assert.equal(await deleteSessionIfUnchanged(redis, 'session:key', 'old-session'), true);
  assert.equal(redis.value, null);
});

test('a refresh lock can only be released by its owner token', async () => {
  const redis = new RedisStoreFake();
  redis.lock = 'current-owner';
  assert.equal(await releaseRefreshLock(redis, 'refresh-lock:key', 'stale-owner'), false);
  assert.equal(redis.lock, 'current-owner');
  assert.equal(await releaseRefreshLock(redis, 'refresh-lock:key', 'current-owner'), true);
  assert.equal(redis.lock, null);
});

test('concurrent request waiters resume after the session value changes', async () => {
  let current = 'old-session';
  let reads = 0;
  const next = await waitForSessionChange(async () => {
    reads += 1;
    if (reads === 2) current = 'refreshed-session';
    return current;
  }, 'old-session', 4, 0);
  assert.equal(next, 'refreshed-session');
});
