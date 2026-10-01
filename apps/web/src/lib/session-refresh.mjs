export const REPLACE_SESSION_IF_UNCHANGED = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;

export const DELETE_SESSION_IF_UNCHANGED = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

export const RELEASE_REFRESH_LOCK_IF_OWNER = `
-- Release only the refresh lock owned by this request.
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

export const REFRESH_LOCK_TTL_SECONDS = 15;

export async function replaceSessionIfUnchanged(client, key, previous, next, ttlSeconds) {
  const result = await client.eval(REPLACE_SESSION_IF_UNCHANGED, {
    keys: [key],
    arguments: [previous, next, String(ttlSeconds)],
  });
  return Number(result) === 1;
}

export async function deleteSessionIfUnchanged(client, key, previous) {
  const result = await client.eval(DELETE_SESSION_IF_UNCHANGED, {
    keys: [key],
    arguments: [previous],
  });
  return Number(result) === 1;
}

export async function releaseRefreshLock(client, key, ownerToken) {
  const result = await client.eval(RELEASE_REFRESH_LOCK_IF_OWNER, {
    keys: [key],
    arguments: [ownerToken],
  });
  return Number(result) === 1;
}

export async function waitForSessionChange(readSessionValue, previous, attempts = 240, delayMs = 50) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const current = await readSessionValue();
    if (current !== previous) return current;
  }
  return previous;
}
