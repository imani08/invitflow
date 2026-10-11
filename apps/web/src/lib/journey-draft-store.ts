import 'server-only';
import { createClient } from 'redis';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DRAFT_COMPARE_AND_SET, DRAFT_TTL_SECONDS, journeyDestination } from './journey-draft-policy.mjs';
type Draft = { revision: number; data: Record<string, unknown>; savedAt: string | null };
function newClient() {
  const url = process.env['REDIS_URL'];
  if (!url) throw new Error('Draft storage unavailable');
  return createClient({ url });
}
let connecting: Promise<ReturnType<typeof newClient>> | undefined;
async function client() {
  if (!connecting) {
    const redis = newClient();
    redis.on('error', () => console.error('[JOURNEY DRAFT] storage unavailable'));
    connecting = redis.connect().then(() => redis).catch(error => { connecting = undefined; throw error; });
  }
  const connection = connecting;
  if (!connection) throw new Error('Draft storage unavailable');
  return connection;
}
function key(owner: string, scope: string) { return 'journey:draft:' + createHash('sha256').update(JSON.stringify([owner, scope])).digest('hex'); }
function secret() {
  const value = process.env['AUTH_SESSION_SECRET'];
  if (!value || value.length < 32) throw new Error('Draft encryption unavailable');
  return createHash('sha256').update('invitaflow-journey-draft\0' + value).digest();
}
function encode(value: Draft) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secret(), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(part => part.toString('base64url')).join('.');
}
function decode(value: string): Draft {
  const [iv, tag, bytes] = value.split('.').map(part => Buffer.from(part, 'base64url'));
  if (!iv || !tag || !bytes) throw new Error('Invalid saved draft');
  const decipher = createDecipheriv('aes-256-gcm', secret(), iv); decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(bytes), decipher.final()]).toString('utf8')) as Draft;
}
export async function readJourneyDraft(owner: string, scope: string): Promise<Draft> {
  const value = await (await client()).get(key(owner, scope));
  return value ? decode(value) : { revision: 0, data: {}, savedAt: null };
}
export async function readJourneyProgress(owner: string, eventId: string): Promise<string | null> {
  return (await client()).get(key(owner, 'progress:' + eventId));
}
export async function saveJourneyDraft(owner: string, scope: string, revision: number, data: Record<string, unknown>, path = scope): Promise<Draft | null> {
  const redis = await client(), storageKey = key(owner, scope), previous = await redis.get(storageKey);
  if ((previous ? decode(previous).revision : 0) !== revision) return null;
  const next = { revision: revision + 1, data, savedAt: new Date().toISOString() };
  const destination = journeyDestination(path);
  const progressKey = key(owner, 'progress:' + (destination?.eventId ?? 'new'));
  const changed = await redis.eval(DRAFT_COMPARE_AND_SET, { keys: [storageKey, progressKey], arguments: [previous ?? '', encode(next), String(DRAFT_TTL_SECONDS), destination?.path ?? scope] });
  return changed === 1 ? next : null;
}
