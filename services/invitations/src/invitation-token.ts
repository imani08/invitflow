import { createHmac, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './env.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function invitationToken(invitationId: string): string {
  if (!uuid.test(invitationId)) throw new Error('Invalid invitation id');
  const signature = createHmac('sha256', requiredEnv('INVITATION_LINK_SECRET')).update(invitationId).digest('base64url');
  return `${invitationId}.${signature}`;
}

export function invitationIdFromToken(token: string): string | null {
  if (typeof token !== 'string' || token.length > 128) return null;
  const [id, signature, extra] = token.split('.');
  if (!id || !signature || extra !== undefined || !uuid.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = createHmac('sha256', requiredEnv('INVITATION_LINK_SECRET')).update(id).digest();
  const supplied = Buffer.from(signature, 'base64url');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? id : null;
}
