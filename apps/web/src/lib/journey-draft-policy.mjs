export const DRAFT_MAX_BYTES = 768 * 1024;
export const DRAFT_TTL_SECONDS = 30 * 24 * 60 * 60;
export function journeyDestination(value) {
  if (typeof value !== 'string' || value.length > 600 || /[\\\u0000-\u0020\u007f]/.test(value) || !value.startsWith('/') || value.startsWith('//')) return null;
  const url = new URL(value, 'https://invitaflow.invalid');
  if (url.origin !== 'https://invitaflow.invalid' || /%2f|%5c|%00|%0[ad]/i.test(value)) return null;
  const match = /^\/events(?:\/([0-9a-f-]{36})(?:\/(designs|guests|invitations(?:\/merci)?))?)?$/.exec(url.pathname);
  if (!match || [...url.searchParams.keys()].some(key => !['event', 'batch'].includes(key))) return null;
  const eventId = match[1] ?? url.searchParams.get('event');
  if (eventId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) return null;
  return { path: url.pathname + url.search + url.hash, scope: url.pathname + (url.searchParams.get('event') ? `?event=${eventId}` : ''), eventId };
}
// Draft validation deliberately permits incomplete form values. Domain validation remains
// mandatory in Events/Designs/Guests/Invitations before committing or emitting anything.
export function validateDraft(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Brouillon invalide.');
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > DRAFT_MAX_BYTES) throw new Error('Brouillon trop volumineux.');
  const walk = (node, depth = 0) => {
    if (depth > 30) throw new Error('Brouillon trop complexe.');
    if (node === null || typeof node === 'boolean' || typeof node === 'number' && Number.isFinite(node)) return;
    if (typeof node === 'string' && node.length <= DRAFT_MAX_BYTES) return;
    if (Array.isArray(node)) { if (node.length > 5000) throw new Error('Brouillon trop volumineux.'); node.forEach(item => walk(item, depth + 1)); return; }
    if (typeof node !== 'object') throw new Error('Brouillon invalide.');
    for (const [key, item] of Object.entries(node)) {
      if (['__proto__', 'prototype', 'constructor', 'accessToken', 'refreshToken', 'authorization', 'password'].includes(key) || key.length > 160) throw new Error('Champ de brouillon interdit.');
      walk(item, depth + 1);
    }
  };
  walk(value);
  return value;
}
export const DRAFT_COMPARE_AND_SET = `
local old = redis.call('GET', KEYS[1])
if (old or '') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
if KEYS[2] then redis.call('SET', KEYS[2], ARGV[4], 'EX', ARGV[3]) end
return 1`;
