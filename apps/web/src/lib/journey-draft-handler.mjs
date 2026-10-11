import { DRAFT_MAX_BYTES, journeyDestination, validateDraft } from './journey-draft-policy.mjs';
import { isExpectedOrigin } from './same-origin.mjs';
/** Production HTTP handler; dependencies are substituted only in tests. */
export async function handleJourneyDraft(request, dependencies) {
  const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
  if (!['GET', 'PUT'].includes(request.method)) return json({}, 405);
  if (request.method !== 'GET' && !isExpectedOrigin(request.headers.get('origin'), dependencies.origin)) return json({ message: 'Origine refusée.' }, 403);
  try {
    const owner = await dependencies.owner();
    if (!owner) return json({ message: 'Reconnectez-vous pour enregistrer.' }, 401);
    const destination = journeyDestination(new URL(request.url).searchParams.get('path'));
    if (!destination) return json({ message: 'Étape invalide.' }, 400);
    if (destination.eventId) {
      const status = await dependencies.eventAccess(destination.eventId);
      if (status !== 200) return json({ message: 'Événement inaccessible.' }, status === 403 || status === 404 ? 403 : 503);
    }
    if (request.method === 'GET') return json(await dependencies.read(owner, destination.scope));
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({}, 415);
    if (Number(request.headers.get('content-length')) > DRAFT_MAX_BYTES + 1024) return json({}, 413);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > DRAFT_MAX_BYTES + 1024) return json({}, 413);
    let body;
    try {
      body = JSON.parse(text);
      if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error();
      body.data = validateDraft(body.data);
    } catch { return json({ message: 'Brouillon invalide ou trop volumineux.' }, 400); }
    const saved = await dependencies.save(owner, destination.scope, body.revision, body.data, destination.path);
    if (!saved) return json({ message: 'Une autre fenêtre a enregistré une version plus récente. Vos modifications locales sont conservées.' }, 409);
    return json(saved);
  } catch { return json({ message: 'Enregistrement indisponible. Vos modifications restent à l’écran.' }, 503); }
}
