import { parseProfileForExport } from './profile-export.mjs';

const PAGE_SIZE = 100;
const LIMITS = Object.freeze({
  events: 2_000,
  guests: 25_000,
  payments: 10_000,
  batches: 10_000,
  notifications: 10_000,
  assets: 10_000,
});
const OMITTED = Object.freeze([
  'Les fichiers PDF/ZIP de sortie doivent être téléchargés séparément depuis les pages d’invitations.',
  'Les octets originaux des assets et les fichiers CSV/XLSX importés ne sont pas inclus.',
  'Les jobs d’import historiques ne disposent pas encore d’API de liste/export.',
]);

export class AccountExportError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = 'AccountExportError';
    this.code = code;
    this.status = status;
  }
}

export async function collectAccountExport({
  accessToken,
  gateway,
  exportedAt = new Date().toISOString(),
  fetcher = fetch,
}) {
  if (typeof accessToken !== 'string' || !accessToken || typeof gateway !== 'string')
    throw new AccountExportError('unauthorized', 401);
  const get = async (path) => {
    let response;
    try {
      response = await fetcher(new URL(path, gateway), {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new AccountExportError('account_data_unavailable', 503);
    }
    if (!response.ok)
      throw new AccountExportError(
        response.status === 401 ? 'unauthorized' : 'account_data_source_failed',
        response.status === 401 ? 401 : 503,
      );
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== 'object')
      throw new AccountExportError('invalid_account_data_response');
    return body;
  };

  const pages = async (path, maximum) => {
    const items = [];
    const cursors = new Set();
    let cursor;
    do {
      const url = new URL(path, gateway);
      url.searchParams.set('limit', String(PAGE_SIZE));
      if (cursor) url.searchParams.set('cursor', cursor);
      const result = await get(`${url.pathname}${url.search}`);
      if (
        !Array.isArray(result.items) ||
        !(result.nextCursor === null || typeof result.nextCursor === 'string')
      )
        throw new AccountExportError('invalid_account_page');
      items.push(...result.items);
      if (items.length > maximum)
        throw new AccountExportError('account_export_limit_exceeded', 413);
      cursor = result.nextCursor ?? undefined;
      if (cursor && cursors.has(cursor)) throw new AccountExportError('invalid_account_page');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return items;
  };

  const profile = parseProfileForExport(await get('/v1/profile/me'));
  if (!profile) throw new AccountExportError('invalid_profile_response');

  const [
    events,
    wallet,
    transactions,
    paymentsRaw,
    notifications,
    notificationPreferences,
    assets,
  ] = await Promise.all([
    pages('/v1/events', LIMITS.events),
    get('/v1/wallet/me'),
    pages('/v1/wallet/me/transactions', 100_000),
    pages('/v1/payments/me', LIMITS.payments),
    pages('/v1/notifications', LIMITS.notifications),
    get('/v1/notifications/preferences'),
    pages('/v1/assets', LIMITS.assets),
  ]);

  let totalGuests = 0;
  let totalBatches = 0;
  const eventData = await mapConcurrent(events, 4, async (event) => {
    if (!event || typeof event.id !== 'string')
      throw new AccountExportError('invalid_event_record');
    const eventPath = `/v1/events/${encodeURIComponent(event.id)}`;
    const [guests, designs, batches] = await Promise.all([
      pages(`${eventPath}/guests`, LIMITS.guests),
      get(`${eventPath}/designs?includeArchived=true`),
      pages(`/v1/invitations/batches?eventId=${encodeURIComponent(event.id)}`, LIMITS.batches),
    ]);
    totalGuests += guests.length;
    totalBatches += batches.length;
    if (totalGuests > LIMITS.guests || totalBatches > LIMITS.batches)
      throw new AccountExportError('account_export_limit_exceeded', 413);
    if (!Array.isArray(designs.items) || designs.items.length > 10_000)
      throw new AccountExportError('invalid_design_page');

    const [designData, ceremonyData, batchData] = await Promise.all([
      mapConcurrent(designs.items, 4, async (summary) => {
        if (typeof summary?.id !== 'string') throw new AccountExportError('invalid_design_record');
        const designPath = `${eventPath}/designs/${encodeURIComponent(summary.id)}`;
        const [design, versions] = await Promise.all([
          get(`${designPath}?includeArchived=true`),
          get(`${designPath}/versions?includeArchived=true`),
        ]);
        if (!Array.isArray(versions.items)) throw new AccountExportError('invalid_design_versions');
        return { design, versions: versions.items };
      }),
      mapConcurrent(
        Array.isArray(event.ceremonies) ? event.ceremonies : [],
        4,
        async (ceremony) => {
          if (typeof ceremony?.id !== 'string')
            throw new AccountExportError('invalid_ceremony_record');
          const ceremonyPath = `${eventPath}/ceremonies/${encodeURIComponent(ceremony.id)}`;
          const [seating, checkIn] = await Promise.all([
            get(`${ceremonyPath}/seating`),
            get(
              `/v1/events/${encodeURIComponent(event.id)}/check-in?ceremonyId=${encodeURIComponent(ceremony.id)}`,
            ),
          ]);
          return { ceremonyId: ceremony.id, seating, checkIn };
        },
      ),
      mapConcurrent(batches, 4, async (summary) => {
        if (typeof summary?.id !== 'string')
          throw new AccountExportError('invalid_invitation_batch');
        const batch = await get(`/v1/invitations/batches/${encodeURIComponent(summary.id)}`);
        const { items = [], ...metadata } = batch;
        return {
          ...metadata,
          items: Array.isArray(items) ? items.map(({ objectKey, ...item }) => item) : [],
        };
      }),
    ]);
    return {
      event,
      guests,
      designs: designData,
      ceremonies: ceremonyData,
      invitationBatches: batchData,
    };
  });

  const payments = paymentsRaw.map(
    ({ checkoutUrl, mockConfirmationAvailable, ...payment }) => payment,
  );
  const document = {
    format: 'invitaflow-account-export-v1',
    exportedAt,
    scope: 'authenticated-account-data',
    completeFor: [
      'profile',
      'events',
      'guests',
      'seating',
      'designs-and-versions',
      'invitation-batches-and-items',
      'wallet',
      'payments',
      'notifications',
      'media-asset-metadata',
    ],
    notIncluded: OMITTED,
    profile,
    events: eventData,
    wallet,
    walletTransactions: transactions,
    payments,
    notifications,
    notificationPreferences,
    mediaAssets: assets,
  };
  if (Buffer.byteLength(JSON.stringify(document), 'utf8') > 20 * 1024 * 1024)
    throw new AccountExportError('account_export_too_large', 413);
  return document;
}

async function mapConcurrent(items, concurrency, mapper) {
  const output = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return output;
}
