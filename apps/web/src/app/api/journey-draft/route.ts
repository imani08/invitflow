import { cookies } from 'next/headers';
import { getSession, sessionCookieName } from '@/lib/auth-session';
import { readJourneyDraft, saveJourneyDraft } from '@/lib/journey-draft-store';
import { handleJourneyDraft } from '@/lib/journey-draft-handler.mjs';
export const runtime = 'nodejs';
async function handle(request: Request) {
  const session = () => cookies().then(store => getSession(store.get(sessionCookieName())?.value));
  return handleJourneyDraft(request, {
    origin: process.env['WEB_ORIGIN'] ?? 'http://localhost:3000',
    owner: async () => (await session())?.user.sub ?? null,
    eventAccess: async eventId => {
      const authenticated = await session();
      if (!authenticated) return 401;
      const response = await fetch(`${process.env['GATEWAY_INTERNAL_URL'] ?? 'http://gateway:3002'}/v1/events/${eventId}`, { headers: { authorization: `Bearer ${authenticated.accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(6000) });
      return response.status;
    },
    read: readJourneyDraft, save: saveJourneyDraft,
  });
}
export const GET = handle;
export const PUT = handle;
