import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  BatchItemStatus,
  BatchStatus,
  InvitationStatus,
  Prisma,
  RsvpStatus,
} from '../generated/prisma/client.js';
import { spawn } from 'node:child_process';
import { lstat, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaService } from './prisma.service.js';
import { InvitationStorage } from './invitation-storage.js';
import { requiredEnv } from './env.js';
import { invitationIdFromToken, invitationToken } from './invitation-token.mjs';
import { renderInvitationImage } from './invitation-image-render.mjs';
import { fitInvitationText, validateInvitationLayout } from './invitation-layout.mjs';
import { renderResolvedLayoutSvg } from '@invitaflow/design-document';

type Obj = Record<string, unknown>;
const object = (v: unknown): Obj =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
const esc = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const safeGuestFilename = (value: unknown) => {
  const base = String(value ?? 'invite')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80);
  return base || 'invite';
};
async function renderStaticPdf(html: string) {
  const dir = await mkdtemp(join(tmpdir(), 'invitaflow-readme-'));
  const input = join(dir, 'readme.html');
  const output = join(dir, 'LISEZ-MOI.pdf');
  try {
    await writeFile(input, html, 'utf8');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.env['CHROMIUM_PATH'] ?? '/usr/bin/chromium-browser', [
        '--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        `--print-to-pdf=${output}`, `file://${input}`,
      ], { stdio: 'ignore' });
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Readme PDF render timeout')); }, 30_000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error('Readme PDF render failed')); });
    });
    const pdf = await readFile(output);
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Readme PDF output is invalid');
    return pdf;
  } finally { await rm(dir, { recursive: true, force: true }); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function assertStorageCapacity(operation: string) {
  try {
    const response = await fetch(`${requiredEnv('MEDIA_SERVICE_URL', 'http://media:3014').replace(/\/$/, '')}/v1/internal/storage/capacity`, {
      headers: { 'x-storage-monitor-token': requiredEnv('STORAGE_MONITOR_TOKEN') },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`Capacity check returned ${response.status}`);
    const capacity = await response.json() as { diskStatsAvailable?: boolean; blocked?: boolean };
    if (capacity.diskStatsAvailable && capacity.blocked)
      throw new ConflictException({ code: 'STORAGE_CAPACITY_EMERGENCY', message: `Impossible de lancer ${operation} : le stockage serveur a atteint son seuil d’urgence.` });
  } catch (error) {
    if (error instanceof ConflictException) throw error;
    throw new ServiceUnavailableException('La capacité du stockage doit être vérifiée avant cette opération.');
  }
}

@Injectable()
export class InvitationService implements OnModuleInit, OnModuleDestroy {
  private busy = false;
  private cleanupTimer?: NodeJS.Timeout;
  private readonly renderImageCache = new Map<string, Promise<string>>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: InvitationStorage,
  ) {}
  onModuleInit() {
    this.cleanupTimer = setInterval(() => void Promise.all([this.cleanupExpiredExports(), this.cleanupAbandonedRenderDirectories()]).catch(() => console.warn(JSON.stringify({ event: 'storage_cleanup_failed' }))), 60 * 60 * 1000);
    this.cleanupTimer.unref();
    void this.cleanupExpiredExports().catch(() => undefined);
    void this.cleanupAbandonedRenderDirectories().catch(() => undefined);
    if (process.env['RENDER_WORKER_ENABLED'] === 'true') {
      const timer = setInterval(() => { void this.work().catch(() => undefined); }, 1200);
      timer.unref();
    }
  }
  onModuleDestroy() { if (this.cleanupTimer) clearInterval(this.cleanupTimer); }

  private async cleanupExpiredExports() {
    const batches = await this.prisma.invitationBatch.findMany({ where: { status: BatchStatus.COMPLETED, zipExpiresAt: { lt: new Date() }, zipDeletedAt: null }, orderBy: { zipExpiresAt: 'asc' }, take: 50, select: { id: true, zipExpiresAt: true, zipCleanupAttempts: true } });
    for (const batch of batches) {
      try {
        await this.storage.delete(`batches/${batch.id}.zip`);
        await this.prisma.invitationBatch.updateMany({ where: { id: batch.id, zipDeletedAt: null, zipExpiresAt: { lte: new Date() } }, data: { zipDeletedAt: new Date(), zipCleanupLastError: null } });
        console.info(JSON.stringify({ event: 'zip_export_expired', batchId: batch.id }));
      } catch {
        await this.prisma.invitationBatch.updateMany({ where: { id: batch.id, zipDeletedAt: null }, data: { zipCleanupAttempts: { increment: 1 }, zipCleanupLastError: 'OBJECT_DELETE_FAILED' } }).catch(() => undefined);
        console.warn(JSON.stringify({ event: 'zip_export_cleanup_retry', batchId: batch.id, attempt: batch.zipCleanupAttempts + 1, errorCode: 'OBJECT_DELETE_FAILED' }));
      }
    }
  }

  private async cleanupAbandonedRenderDirectories() {
    const maxAgeMs = Math.max(1, Math.min(168, Number(process.env['STORAGE_TEMP_RENDER_TTL_HOURS'] ?? 24))) * 60 * 60 * 1000;
    const cutoff = Date.now() - maxAgeMs;
    let entries: Array<{ name: string; isDirectory(): boolean }>;
    try { entries = await readdir(tmpdir(), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^invitaflow-(?:render|readme)-[A-Za-z0-9_-]+$/u.test(entry.name)) continue;
      const path = join(tmpdir(), entry.name);
      try {
        const metadata = await lstat(path);
        if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.mtimeMs >= cutoff) continue;
        await rm(path, { recursive: true, force: true });
      } catch { console.warn(JSON.stringify({ event: 'temp_render_cleanup_retry' })); }
    }
  }

  private async upstream(url: string, authorization: string) {
    const response = await fetch(url, {
      headers: { authorization },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new BadRequestException(body?.message ?? `Snapshot source returned ${response.status}`);
    return body;
  }
  private async snapshots(
    eventId: string,
    designId: string,
    guestIds: string[],
    authorization: string,
  ) {
    const events = requiredEnv('EVENTS_SERVICE_URL');
    const designs = requiredEnv('DESIGNS_SERVICE_URL');
    const guests = requiredEnv('GUESTS_SERVICE_URL');
    const seating = requiredEnv('SEATING_SERVICE_URL');
    const media = requiredEnv('MEDIA_SERVICE_URL', 'http://media:3014');
    const [event, design] = await Promise.all([
      this.upstream(`${events}/v1/events/${eventId}`, authorization),
      this.upstream(`${designs}/v1/events/${eventId}/designs/${designId}`, authorization),
    ]);
    const allGuests: Obj[] = [];
    let cursor = '';
    do {
      const page = await this.upstream(
        `${guests}/v1/events/${eventId}/guests?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        authorization,
      );
      allGuests.push(...(Array.isArray(page?.items) ? page.items : []));
      cursor = typeof page?.nextCursor === 'string' ? page.nextCursor : '';
      if (allGuests.length > 5000)
        throw new BadRequestException('Un lot ne peut pas dépasser 5 000 invités.');
    } while (cursor);
    const selected = guestIds.length
      ? allGuests.filter((g) => typeof g.id === 'string' && guestIds.includes(g.id))
      : allGuests;
    if (!selected.length || selected.length > 5000)
      throw new BadRequestException('Le lot doit contenir entre 1 et 5 000 invités.');
    if (guestIds.length && selected.length !== new Set(guestIds).size)
      throw new BadRequestException(
        'Un ou plusieurs invités sont introuvables dans cet événement.',
      );
    const ceremonySnapshots = await Promise.all(
      (Array.isArray(event?.ceremonies) ? event.ceremonies : []).map(async (ceremony: Obj) => {
        try {
          const [plan, assignments] = await Promise.all([
            this.upstream(
              `${seating}/v1/events/${eventId}/ceremonies/${ceremony.id}/seating`,
              authorization,
            ),
            this.upstream(
              `${seating}/v1/events/${eventId}/ceremonies/${ceremony.id}/seating/assignments`,
              authorization,
            ),
          ]);
          const tables = object(plan).mode === 'TABLE'
            ? await this.upstream(`${seating}/v1/events/${eventId}/ceremonies/${ceremony.id}/seating/tables`, authorization).catch(() => null)
            : null;
          return { ceremony, plan, assignments, tables };
        } catch {
          return { ceremony, plan: null, assignments: null, tables: null };
        }
      }),
    );
    const seatingFor = (guestId: string) =>
      ceremonySnapshots.map((entry: Obj) => {
        const source = object(entry.assignments);
        const rows = Array.isArray(entry.assignments)
          ? entry.assignments
          : Array.isArray(source.items)
            ? source.items
            : [];
        const assignment = rows.find((row: Obj) => row.guestId === guestId) ?? null;
        const tableRows = Array.isArray(entry.tables) ? entry.tables : Array.isArray(object(entry.tables).items) ? object(entry.tables).items as Obj[] : [];
        const table = assignment && typeof assignment.tableId === 'string' ? tableRows.find((row: Obj) => row.id === assignment.tableId) : undefined;
        return {
          ceremonyId: object(entry.ceremony).id,
          plan: entry.plan,
          assignment,
          tableName: typeof table?.name === 'string' ? table.name : '',
        };
      });
    const doc = object(design?.document);
    const photoLayers = [...new Map((Array.isArray(doc.elements) ? doc.elements : [])
      .filter((value: unknown) => object(value).type === 'IMAGE' && typeof object(value).assetId === 'string')
      .map((value: unknown) => object(value))
      .map((layer) => [String(layer.assetId), { assetId: String(layer.assetId), fallbackAssetId: typeof layer.originalAssetId === 'string' ? layer.originalAssetId : null }] as const)).values()];
    const photoAssets = await Promise.all(photoLayers.map(async ({ assetId, fallbackAssetId }) => {
      const getContent = (id: string) => fetch(media.replace(/\/$/, '') + '/v1/assets/' + encodeURIComponent(id) + '/content', { headers: { authorization }, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      let response = await getContent(assetId);
      let storedFromAssetId = assetId;
      if (!response.ok && fallbackAssetId && fallbackAssetId !== assetId) { response = await getContent(fallbackAssetId); storedFromAssetId = fallbackAssetId; }
      if (!response.ok) throw new BadRequestException('La photo ' + assetId + ' n’est pas accessible ou prête.');
      const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      if (mimeType !== 'image/webp' && mimeType !== 'image/png') throw new BadRequestException('Le média de la photo n’est pas un WebP ou PNG validé.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new BadRequestException('Le média de la photo dépasse la taille de rendu autorisée.');
      return { assetId, storedFromAssetId, bytes, mimeType };
    }));
    const version = Number.isInteger(design?.version) ? design.version : 1;
    return {
      event,
      design: { id: design.id, version, name: design.name, document: doc },
      photoAssets,
      ceremonySnapshots,
      guests: selected,
      seatingFor,
    };
  }
  async createBatch(
    owner: string,
    eventId: string,
    authorization: string,
    idempotencyKey: string,
    raw: unknown,
  ) {
    await assertStorageCapacity('une génération d’invitations');
    if (!uuid.test(eventId)) throw new BadRequestException('eventId invalide.');
    if (!/^[A-Za-z0-9._:@/-]{1,200}$/.test(idempotencyKey ?? ''))
      throw new BadRequestException('Idempotency-Key obligatoire et invalide.');
    const input = object(raw);
    const designId = input.designId;
    if (
      Object.keys(input).some((k) => !['designId', 'guestIds'].includes(k)) ||
      typeof designId !== 'string' ||
      !uuid.test(designId)
    )
      throw new BadRequestException('designId invalide.');
    const guestIdsInput = input.guestIds;
    const guestIds = guestIdsInput === undefined ? [] : guestIdsInput;
    if (
      !Array.isArray(guestIds) ||
      guestIds.length > 5000 ||
      guestIds.some((id: unknown) => typeof id !== 'string' || !uuid.test(id))
    )
      throw new BadRequestException('guestIds doit être une liste d’UUID.');
    const validatedGuestIds = guestIds as string[];
    const prior = await this.prisma.invitationBatch.findUnique({
      where: { ownerSubject_idempotencyKey: { ownerSubject: owner, idempotencyKey } },
      include: { items: true },
    });
    if (prior) {
      const requestedGuests = [...new Set(validatedGuestIds)].sort();
      const priorGuests = [...new Set(prior.items.map((item) => item.guestId))].sort();
      if (
        prior.eventId !== eventId ||
        prior.designId !== designId ||
        (requestedGuests.length > 0 &&
          (requestedGuests.length !== priorGuests.length ||
            requestedGuests.some((guestId, index) => guestId !== priorGuests[index])))
      )
        throw new ConflictException('Cette clé d’idempotence a déjà été utilisée pour une autre demande de génération.');
      return prior;
    }
    const snapshot = await this.snapshots(eventId, designId, validatedGuestIds, authorization);
    const document = object(snapshot.design.document) ? object(snapshot.design.document) as Obj : {};
    const constraints = object(document.constraints) ? object(document.constraints) : {};
    const rawSafeMargin = constraints.safeMargin;
    const marginObject = object(rawSafeMargin);
    const safeMargin = typeof rawSafeMargin === 'number' ? rawSafeMargin : ['top', 'right', 'bottom', 'left'].every((edge) => typeof marginObject[edge] === 'number') ? marginObject as { top: number; right: number; bottom: number; left: number } : 64;
    const resolvedLayouts = new Map<string, unknown>();
    for (const guest of snapshot.guests) {
      const seating = snapshot.seatingFor(String(guest.id));
      const tableName = [...new Set(seating.map((item: Obj) => item.tableName).filter((name: unknown): name is string => typeof name === 'string' && !!name.trim()))].join(' · ');
      const ceremonyName = (Array.isArray(snapshot.ceremonySnapshots) ? snapshot.ceremonySnapshots : []).map((item: unknown) => { const ceremony = object(object(item).ceremony); return String(ceremony.name ?? ceremony.title ?? ''); }).filter(Boolean).join(' · ');
      const previewQrUrl = `${requiredEnv('PUBLIC_WEB_URL').replace(/\/$/, '')}/invite/${invitationToken(randomUUID())}`;
      const ceremonyData = (Array.isArray(snapshot.ceremonySnapshots) ? snapshot.ceremonySnapshots : []).map((item: unknown) => {
        const ceremony = object(object(item).ceremony);
        return { name: ceremony.name ?? ceremony.title, date: ceremony.date ?? ceremony.startAt, time: ceremony.time, venue: ceremony.venue, address: ceremony.address, reference: ceremony.reference, dressCode: ceremony.dressCode };
      });
      const layout = validateInvitationLayout({ document, values: { guest_name: String(guest.fullName ?? ''), guest_email: String(guest.email ?? ''), table_name: tableName, event_name: String(object(snapshot.event).name ?? ''), couple_names: String(object(snapshot.event).coupleNames ?? ''), invitation_text: String(object(snapshot.event).invitationText ?? ''), ceremony_name: ceremonyName, ceremonies: ceremonyData, event_date: String(object(snapshot.event).startAt ?? object(snapshot.event).date ?? ''), event_location: String(object(object(snapshot.event).venue).name ?? object(snapshot.event).location ?? ''), contact: String(object(snapshot.event).contact ?? ''), qr_code: previewQrUrl, rsvp_link: previewQrUrl }, safeMargin });
      if (layout.errors.length) throw new BadRequestException({ code: 'INVITATION_LAYOUT_INVALID', errors: layout.errors });
      resolvedLayouts.set(String(guest.id), layout.resolvedLayout);
    }
    const batchId = randomUUID();
    const renderAssets = Object.fromEntries(snapshot.photoAssets.map((asset) => [asset.assetId, { key: 'batches/' + batchId + '/' + asset.assetId + (asset.mimeType === 'image/png' ? '.png' : '.webp'), mimeType: asset.mimeType }]));
    const ref = `invitation-batch/${batchId}`;
    const eventsUrl = requiredEnv('EVENTS_SERVICE_URL').replace(/\/$/, '');
    const agencyWorkspaceId = typeof snapshot.event?.agencyWorkspaceId === 'string' ? snapshot.event.agencyWorkspaceId : null;
    let agencyReservedCredits = 0;
    let agencyReference: string | null = null;
    if (agencyWorkspaceId) {
      agencyReference = `agency-invitation-batch/${batchId}`;
    }
    let walletReservedCredits = snapshot.guests.length;
    try {
    for (const asset of snapshot.photoAssets) await this.storage.put(renderAssets[asset.assetId]!.key, asset.bytes, asset.mimeType!);
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.invitationBatch.create({
        data: {
          id: batchId,
          ownerSubject: owner,
          eventId,
          designId,
          designVersion: snapshot.design.version,
          idempotencyKey,
          reservationReference: ref,
          agencyReservationReference: agencyReference,
          agencyWorkspaceId,
          agencyReservedCredits,
          walletReservedCredits,
          totalItems: snapshot.guests.length,
        },
      });
      for (const guest of snapshot.guests) {
        if (typeof guest.id !== 'string' || !uuid.test(guest.id))
          throw new BadRequestException('Un invité source possède un identifiant invalide.');
        const invitation = await tx.invitation.upsert({
          where: { eventId_guestId: { eventId, guestId: guest.id } },
          create: {
            ownerSubject: owner,
            eventId,
            guestId: guest.id,
            status: InvitationStatus.GENERATION_PENDING,
          },
          update: { status: InvitationStatus.GENERATION_PENDING },
        });
        const old = await tx.invitationVersion.findFirst({
          where: { invitationId: invitation.id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const renderSnapshot = {
          jobId: batchId,
          invitationId: invitation.id,
          designSnapshot: snapshot.design,
          guestSnapshot: guest,
          eventSnapshot: snapshot.event,
          ceremonySnapshots: snapshot.ceremonySnapshots,
          seatingSnapshot: snapshot.seatingFor(guest.id),
          renderAssets,
          resolvedLayout: resolvedLayouts.get(String(guest.id)),
        };
        const version = await tx.invitationVersion.create({
          data: {
            invitationId: invitation.id,
            version: (old?.version ?? 0) + 1,
            designId,
            designVersion: snapshot.design.version,
            snapshot: renderSnapshot as Prisma.InputJsonValue,
          },
        });
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { currentVersionId: version.id },
        });
        await tx.batchItem.create({
          data: {
            batchId,
            invitationId: invitation.id,
            guestId: guest.id,
            snapshot: renderSnapshot as Prisma.InputJsonValue,
          },
        });
      }
      return created;
    });
    } catch (error) {
      await Promise.allSettled(Object.values(renderAssets).map((entry) => this.storage.delete(entry.key)));
      throw error;
    }
    try {
      if (agencyReference && agencyWorkspaceId) {
        const quotaReservation = await fetch(`${eventsUrl}/v1/agencies/${encodeURIComponent(agencyWorkspaceId)}/quota/reservations`, { method: 'POST', headers: { authorization, 'content-type': 'application/json', 'idempotency-key': `reserve-${batchId}` }, body: JSON.stringify({ eventId, referenceKey: agencyReference, credits: snapshot.guests.length, allowPartial: true }), signal: AbortSignal.timeout(10_000) });
        const reservation: unknown = await quotaReservation.json().catch(() => null);
        const reserved = reservation && typeof reservation === 'object' ? (reservation as Record<string, unknown>)['reservedCredits'] : undefined;
        if (!quotaReservation.ok || !Number.isSafeInteger(reserved) || (reserved as number) < 0 || (reserved as number) > snapshot.guests.length) throw new Error(`agency quota reservation failed ${quotaReservation.status}`);
        agencyReservedCredits = reserved as number;
        walletReservedCredits = snapshot.guests.length - agencyReservedCredits;
        if (agencyReservedCredits === 0) agencyReference = null;
        await this.prisma.invitationBatch.update({ where: { id: batchId }, data: { agencyReservationReference: agencyReference, agencyReservedCredits, walletReservedCredits } });
      }
      if (walletReservedCredits > 0) {
      const response = await fetch(
        `${requiredEnv('WALLET_SERVICE_URL')}/v1/internal/wallets/${encodeURIComponent(owner)}/reservations`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-service-token': requiredEnv('WALLET_INTERNAL_TOKEN'),
            'idempotency-key': `reserve-${batchId}`,
          },
          body: JSON.stringify({ credits: walletReservedCredits, referenceId: ref }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw new Error(`wallet reservation failed ${response.status}`);
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.invitationBatch.update({
          where: { id: batchId },
          data: { status: BatchStatus.QUEUED },
        });
        await tx.outboxMessage.create({
          data: {
            eventType: 'invitation.render.requested.v1',
            aggregateId: batchId,
            payload: { batchId, itemCount: snapshot.guests.length, ownerSubject: owner },
          },
        });
      });
    } catch {
      const [walletReleased, agencyReleased] = await Promise.all([
        walletReservedCredits > 0 ? this.releaseReservation(owner, ref, walletReservedCredits) : Promise.resolve(true),
        agencyReference && agencyWorkspaceId ? this.releaseAgencyQuota(agencyWorkspaceId, agencyReference, authorization) : Promise.resolve(true),
      ]);
      await this.prisma.$transaction(async (tx) => {
        await tx.invitationBatch.update({
          where: { id: batchId },
          data: { status: BatchStatus.FAILED, reservationReleasePending: !walletReleased || !agencyReleased },
        });
        await tx.batchItem.updateMany({
          where: { batchId },
          data: { status: BatchItemStatus.FAILED, errorCode: 'CREDIT_RESERVATION_FAILED' },
        });
      });
      await Promise.allSettled(Object.values(renderAssets).map((entry) => this.storage.delete(entry.key)));
      throw new ConflictException('Les crédits n’ont pas pu être réservés; le lot a été arrêté.');
    }
    return this.getBatch(owner, batchId);
  }
  async list(owner: string, eventId?: string, rawLimit?: string, cursor?: string) {
    const where = { ownerSubject: owner, ...(eventId ? { eventId } : {}) };
    const include = { _count: { select: { items: true } } } as const;
    if (rawLimit === undefined && cursor === undefined)
      return this.prisma.invitationBatch.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
        include,
      });
    const limit = rawLimit === undefined ? 50 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new BadRequestException('La limite doit être comprise entre 1 et 100.');
    if (cursor !== undefined && !uuid.test(cursor))
      throw new BadRequestException('Le curseur du lot est invalide.');
    if (
      cursor &&
      !(await this.prisma.invitationBatch.findFirst({
        where: { id: cursor, ...where },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Le curseur ne correspond pas à un lot du compte.');
    const rows = await this.prisma.invitationBatch.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include,
    });
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
  }
  async getBatch(owner: string, id: string) {
    const batch = await this.prisma.invitationBatch.findFirst({
      where: { id, ownerSubject: owner },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            guestId: true,
            status: true,
            objectKey: true,
            errorCode: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!batch) throw new NotFoundException('Lot introuvable.');
    return batch;
  }
  async cancel(owner: string, id: string) {
    let batch = await this.prisma.invitationBatch.findFirst({
      where: { id, ownerSubject: owner },
      include: { items: true },
    });
    if (!batch) throw new NotFoundException('Lot introuvable.');
    if (batch.status === BatchStatus.COMPLETED || batch.status === BatchStatus.FAILED)
      return this.getBatch(owner, id);
    if (batch.status === BatchStatus.RESERVING)
      throw new ConflictException(
        'La réservation des crédits est en cours; réessayez dans quelques instants.',
      );
    await this.prisma.invitationBatch.updateMany({
      where: {
        id,
        ownerSubject: owner,
        status: { in: [BatchStatus.RESERVING, BatchStatus.QUEUED, BatchStatus.GENERATING] },
      },
      data: { status: BatchStatus.CANCELLED, cancelledAt: new Date() },
    });
    batch = await this.prisma.invitationBatch.findFirstOrThrow({
      where: { id, ownerSubject: owner },
      include: { items: true },
    });
    const generated = batch.items.filter((i) => i.status === BatchItemStatus.GENERATED);
    const failed = batch.items.filter((i) => i.status === BatchItemStatus.FAILED).length;
    const consumed = generated.length;
    await this.settle(batch, consumed);
    await this.prisma.$transaction(async (tx) => {
      await tx.invitationBatch.update({
        where: { id },
        data: { completedItems: consumed, failedItems: failed },
      });
      await tx.batchItem.updateMany({
        where: { batchId: id, status: { in: [BatchItemStatus.QUEUED, BatchItemStatus.FAILED] } },
        data: { status: BatchItemStatus.CANCELLED, errorCode: 'BATCH_CANCELLED' },
      });
    });
    const activeItems = await this.prisma.batchItem.count({ where: { batchId: id, status: BatchItemStatus.GENERATING } });
    if (!activeItems) await this.cleanupRenderAssets(batch.items[0]?.snapshot);
    return this.getBatch(owner, id);
  }
  private async cleanupRenderAssets(snapshotValue: unknown) {
    const assets = object(object(snapshotValue).renderAssets);
    const keys = Object.values(assets).flatMap((entry) => typeof entry === 'string' ? [entry] : typeof object(entry)['key'] === 'string' ? [object(entry)['key'] as string] : []);
    await Promise.all(keys.map((key) => this.storage.delete(key)));
    for (const key of keys) for (const cacheKey of this.renderImageCache.keys()) if (cacheKey.startsWith(key + '|')) this.renderImageCache.delete(cacheKey);
  }
  private renderImageSource(key: string, mimeType: string) {
    const cacheKey = key + '|' + mimeType;
    const cached = this.renderImageCache.get(cacheKey);
    if (cached) return cached;
    const loading = this.storage.get(key).then((bytes) => {
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('Invitation image snapshot size is invalid');
      return 'data:' + mimeType + ';base64,' + bytes.toString('base64');
    }).catch((error) => {
      this.renderImageCache.delete(cacheKey);
      throw error;
    });
    this.renderImageCache.set(cacheKey, loading);
    while (this.renderImageCache.size > 12) this.renderImageCache.delete(this.renderImageCache.keys().next().value!);
    return loading;
  }
  private async settle(
    batch: { ownerSubject: string; reservationReference: string; agencyWorkspaceId: string | null; agencyReservationReference: string | null; agencyReservedCredits: number; walletReservedCredits: number },
    consumedCredits: number,
  ) {
    const agencyReserved = batch.agencyReservedCredits ?? 0;
    const walletReserved = batch.walletReservedCredits ?? Math.max(0, consumedCredits);
    const agencyConsumed = Math.min(consumedCredits, agencyReserved);
    if (batch.agencyWorkspaceId && batch.agencyReservationReference) {
      const agencyResponse = await fetch(`${requiredEnv('EVENTS_SERVICE_URL').replace(/\/$/, '')}/v1/internal/agencies/${encodeURIComponent(batch.agencyWorkspaceId)}/quota/${encodeURIComponent(batch.agencyReservationReference)}/settle`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-service-token': requiredEnv('WALLET_INTERNAL_TOKEN'), 'idempotency-key': `agency-settle-${batch.agencyReservationReference}` },
        body: JSON.stringify({ consumedCredits: agencyConsumed }), signal: AbortSignal.timeout(10_000),
      });
      if (!agencyResponse.ok) throw new Error('Agency quota settlement failed');
    }
    const walletConsumed = Math.min(walletReserved, Math.max(0, consumedCredits - agencyReserved));
    if (walletReserved < 1) return;
    const response = await fetch(
      `${requiredEnv('WALLET_SERVICE_URL')}/v1/internal/wallets/${encodeURIComponent(batch.ownerSubject)}/reservations/${encodeURIComponent(batch.reservationReference)}/settle`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-service-token': requiredEnv('WALLET_INTERNAL_TOKEN'),
          'idempotency-key': `settle-${batch.reservationReference}`,
        },
        body: JSON.stringify({ consumedCredits: walletConsumed }),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error('Wallet settlement failed');
  }
  private async releaseReservation(owner: string, reference: string, credits: number) {
    try {
      const response = await fetch(
        `${requiredEnv('WALLET_SERVICE_URL')}/v1/internal/wallets/${encodeURIComponent(owner)}/reservations/${encodeURIComponent(reference)}/release`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-service-token': requiredEnv('WALLET_INTERNAL_TOKEN'),
            'idempotency-key': `release-${reference}`,
          },
          body: JSON.stringify({ credits }),
          signal: AbortSignal.timeout(10000),
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }
  private async releaseAgencyQuota(workspaceId: string, reference: string, authorization: string) {
    try {
      const response = await fetch(`${requiredEnv('EVENTS_SERVICE_URL').replace(/\/$/, '')}/v1/agencies/${encodeURIComponent(workspaceId)}/quota/${encodeURIComponent(reference)}/release`, { method: 'POST', headers: { authorization }, signal: AbortSignal.timeout(10_000) });
      return response.ok;
    } catch { return false; }
  }
  private async retryPendingReservationReleases() {
    const batches = await this.prisma.invitationBatch.findMany({
      where: { status: BatchStatus.FAILED, reservationReleasePending: true },
      orderBy: { updatedAt: 'asc' },
      take: 20,
      select: { id: true, ownerSubject: true, reservationReference: true, totalItems: true, walletReservedCredits: true, agencyWorkspaceId: true, agencyReservationReference: true },
      });
      for (const batch of batches) {
        // Rows created before the agency quota split are fully backed by Wallet.
        const walletReservedCredits = batch.walletReservedCredits ?? batch.totalItems;
        const [walletReleased, agencyReleased] = await Promise.all([
          walletReservedCredits > 0 ? this.releaseReservation(batch.ownerSubject, batch.reservationReference, walletReservedCredits) : Promise.resolve(true),
        batch.agencyWorkspaceId && batch.agencyReservationReference ? this.releaseAgencyQuotaInternal(batch.agencyWorkspaceId, batch.agencyReservationReference) : Promise.resolve(true),
      ]);
      if (walletReleased && agencyReleased) {
        await this.prisma.invitationBatch.updateMany({
          where: { id: batch.id, status: BatchStatus.FAILED, reservationReleasePending: true },
          data: { reservationReleasePending: false },
        });
      }
    }
  }
  private async releaseAgencyQuotaInternal(workspaceId: string, reference: string) {
    try {
      const response = await fetch(`${requiredEnv('EVENTS_SERVICE_URL').replace(/\/$/, '')}/v1/internal/agencies/${encodeURIComponent(workspaceId)}/quota/${encodeURIComponent(reference)}/release`, { method: 'POST', headers: { 'x-service-token': requiredEnv('WALLET_INTERNAL_TOKEN') }, signal: AbortSignal.timeout(10_000) });
      return response.ok;
    } catch { return false; }
  }
  async download(owner: string, batchId: string, itemId?: string) {
    const batch = await this.prisma.invitationBatch.findFirst({
      where: { id: batchId, ownerSubject: owner },
      include: { items: true },
    });
    if (!batch) throw new NotFoundException('Lot introuvable.');
    if (itemId) {
      const item = batch.items.find((i) => i.id === itemId);
      if (!item?.objectKey || item.status !== BatchItemStatus.GENERATED)
        throw new NotFoundException('PDF introuvable.');
      return {
        body: (await this.storage.stream(item.objectKey)).body!,
        type: 'application/pdf',
        name: `invitation-${item.guestId}.pdf`,
      };
    }
    const key = `batches/${batchId}.zip`;
    if (batch.status !== BatchStatus.COMPLETED)
      throw new ConflictException('Le ZIP est disponible après le rendu complet du lot.');
    if (batch.zipDeletedAt || (batch.zipExpiresAt && batch.zipExpiresAt <= new Date()))
      throw new ConflictException({ code: 'ZIP_EXPIRED', message: 'Le ZIP a expiré. Régénérez-le à partir des PDF conservés.' });
    return {
      body: (await this.storage.stream(key)).body!,
      type: 'application/zip',
      name: `invitations-${batchId}.zip`,
    };
  }

  async regenerateZip(owner: string, batchId: string) {
    await assertStorageCapacity('la régénération d’un ZIP');
    const batch = await this.prisma.invitationBatch.findFirst({ where: { id: batchId, ownerSubject: owner }, include: { items: { where: { status: BatchItemStatus.GENERATED }, orderBy: { createdAt: 'asc' } } } });
    if (!batch) throw new NotFoundException('Lot introuvable.');
    if (batch.status !== BatchStatus.COMPLETED || !batch.items.length || batch.items.some((item) => !item.objectKey)) throw new ConflictException('Les PDF finaux ne sont pas disponibles pour régénérer le ZIP.');
    const files = await Promise.all(batch.items.map(async (item) => ({ name: `invitations/${safeGuestFilename(object(object(item.snapshot).guestSnapshot).fullName)}--${item.guestId.slice(0, 8)}.pdf`, bytes: await this.storage.get(item.objectKey!) })));
    const event = object(object(batch.items[0]!.snapshot).eventSnapshot);
    const readme = await renderStaticPdf(`<!doctype html><html lang="fr"><meta charset="utf-8"><style>@page{size:A4;margin:22mm}body{font:12pt Arial;line-height:1.5}h1{font:26pt Georgia;color:#684d3e}</style><h1>Votre lot d’invitations</h1><p>${esc(event.name ?? 'Événement')} · ${files.length} PDF</p><p>Les invitations individuelles se trouvent dans le dossier invitations. Conservez chaque PDF privé et transmettez-le uniquement à son invité.</p></html>`);
    const archive = createZip([...files, { name: 'LISEZ-MOI.pdf', bytes: readme }]);
    const key = `batches/${batch.id}.zip`;
    await this.storage.put(key, archive, 'application/zip');
    const ttlDays = Math.max(1, Math.min(365, Number(process.env['STORAGE_ZIP_TTL_DAYS'] ?? 5)));
    const zipExpiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.prisma.invitationBatch.updateMany({ where: { id: batch.id, ownerSubject: owner, status: BatchStatus.COMPLETED }, data: { zipExpiresAt, zipDeletedAt: null, zipSizeBytes: BigInt(archive.byteLength) } });
    return { id: batch.id, status: batch.status, zipExpiresAt };
  }

  async getAdminStorageStats() {
    const now = new Date();
    const [pdfs, zips, byEvent, byAgency] = await Promise.all([
      this.prisma.batchItem.aggregate({ where: { status: BatchItemStatus.GENERATED, objectKey: { not: null } }, _sum: { sizeBytes: true }, _count: { _all: true } }),
      this.prisma.invitationBatch.aggregate({ where: { status: BatchStatus.COMPLETED, zipDeletedAt: null, zipExpiresAt: { gt: now } }, _sum: { zipSizeBytes: true }, _count: { _all: true } }),
      this.prisma.$queryRaw<Array<{ event_id: string; bytes: bigint | null; pdf_count: bigint; zip_bytes: bigint | null; zip_count: bigint }>>(Prisma.sql`
        WITH pdf AS (
          SELECT b.event_id, SUM(i.size_bytes) AS bytes, COUNT(i.id) FILTER (WHERE i.object_key IS NOT NULL AND i.status = 'GENERATED') AS file_count
          FROM invitation_batches b JOIN invitation_batch_items i ON i.batch_id = b.id GROUP BY b.event_id
        ), zip AS (
          SELECT event_id, SUM(zip_size_bytes) AS bytes, COUNT(*) AS file_count FROM invitation_batches
          WHERE zip_deleted_at IS NULL AND zip_expires_at > ${now} GROUP BY event_id
        )
        SELECT COALESCE(pdf.event_id, zip.event_id) AS event_id, pdf.bytes, COALESCE(pdf.file_count, 0) AS pdf_count, zip.bytes AS zip_bytes, COALESCE(zip.file_count, 0) AS zip_count
        FROM pdf FULL OUTER JOIN zip ON zip.event_id = pdf.event_id
        ORDER BY (COALESCE(pdf.bytes, 0) + COALESCE(zip.bytes, 0)) DESC LIMIT 10`),
      this.prisma.$queryRaw<Array<{ agency_workspace_id: string | null; owner_subject: string; bytes: bigint | null; file_count: bigint }>>(Prisma.sql`
        WITH pdf AS (
          SELECT b.agency_workspace_id, b.owner_subject, SUM(i.size_bytes) AS bytes, COUNT(i.id) FILTER (WHERE i.object_key IS NOT NULL AND i.status = 'GENERATED') AS file_count
          FROM invitation_batches b JOIN invitation_batch_items i ON i.batch_id = b.id GROUP BY b.agency_workspace_id, b.owner_subject
        ), zip AS (
          SELECT agency_workspace_id, owner_subject, SUM(zip_size_bytes) AS bytes, COUNT(*) AS file_count FROM invitation_batches
          WHERE zip_deleted_at IS NULL AND zip_expires_at > ${now} GROUP BY agency_workspace_id, owner_subject
        )
        SELECT COALESCE(pdf.agency_workspace_id, zip.agency_workspace_id) AS agency_workspace_id, COALESCE(pdf.owner_subject, zip.owner_subject) AS owner_subject,
          COALESCE(pdf.bytes, 0) + COALESCE(zip.bytes, 0) AS bytes, COALESCE(pdf.file_count, 0) + COALESCE(zip.file_count, 0) AS file_count
        FROM pdf FULL OUTER JOIN zip ON zip.agency_workspace_id IS NOT DISTINCT FROM pdf.agency_workspace_id AND zip.owner_subject = pdf.owner_subject
        ORDER BY (COALESCE(pdf.bytes, 0) + COALESCE(zip.bytes, 0)) DESC LIMIT 10`),
    ]);
    const num = (value: bigint | number | null) => value === null ? null : Number(value);
    return {
      measuredAt: now.toISOString(),
      pdf: { bytes: num(pdfs._sum.sizeBytes), count: pdfs._count._all, unknownSizeCount: await this.prisma.batchItem.count({ where: { status: BatchItemStatus.GENERATED, objectKey: { not: null }, sizeBytes: null } }) },
      zip: { bytes: num(zips._sum.zipSizeBytes), count: zips._count._all, unknownSizeCount: await this.prisma.invitationBatch.count({ where: { status: BatchStatus.COMPLETED, zipDeletedAt: null, zipExpiresAt: { gt: now }, zipSizeBytes: null } }) },
      cleanup: { zipDeletionErrors: await this.prisma.invitationBatch.count({ where: { zipDeletedAt: null, zipCleanupAttempts: { gt: 0 } } }), zipRetryable: await this.prisma.invitationBatch.count({ where: { zipDeletedAt: null, zipCleanupAttempts: { gt: 0 }, zipExpiresAt: { lt: now } } }) },
      byEvent: byEvent.map((row) => ({ eventId: row.event_id, bytes: num(row.bytes), pdfCount: num(row.pdf_count), zipBytes: num(row.zip_bytes), zipCount: num(row.zip_count) })),
      byAgencyOrClient: byAgency.map((row) => ({ agencyWorkspaceId: row.agency_workspace_id, ownerSubject: row.owner_subject, bytes: num(row.bytes), fileCount: num(row.file_count) })),
      source: 'invitations-database-recorded-object-sizes',
    };
  }

  async checkStorageReference(assetId: string, objectKey: string) {
    const pattern = `%${assetId}%`;
    const keyPattern = `%${objectKey}%`;
    const rows = await this.prisma.$queryRaw<Array<{ referenced: boolean }>>(Prisma.sql`SELECT EXISTS (
      SELECT 1 FROM invitation_versions WHERE snapshot::text LIKE ${pattern} OR snapshot::text LIKE ${keyPattern}
      UNION ALL SELECT 1 FROM invitation_batch_items WHERE snapshot::text LIKE ${pattern} OR snapshot::text LIKE ${keyPattern}
    ) AS referenced`);
    return { status: rows[0]?.referenced ? 'REFERENCED' as const : 'UNREFERENCED' as const };
  }

  async getStorageInventoryPage(pdfCursor?: string, zipCursor?: string) {
    const limit = 500;
    const [pdfRows, zipRows] = await Promise.all([
      this.prisma.batchItem.findMany({ where: { status: BatchItemStatus.GENERATED, objectKey: { not: null } }, orderBy: { id: 'asc' }, take: limit + 1, ...(pdfCursor ? { cursor: { id: pdfCursor }, skip: 1 } : {}), select: { id: true, objectKey: true } }),
      this.prisma.invitationBatch.findMany({ where: { status: BatchStatus.COMPLETED, zipExpiresAt: { not: null }, zipDeletedAt: null }, orderBy: { id: 'asc' }, take: limit + 1, ...(zipCursor ? { cursor: { id: zipCursor }, skip: 1 } : {}), select: { id: true, zipExpiresAt: true, zipSizeBytes: true } }),
    ]);
    const pdfHasMore = pdfRows.length > limit;
    const zipHasMore = zipRows.length > limit;
    const pdfPage = pdfRows.slice(0, limit);
    const zipPage = zipRows.slice(0, limit);
    return {
      pdfKeys: pdfPage.flatMap((row) => row.objectKey ? [row.objectKey] : []),
      zipKeys: zipPage.map((row) => ({ key: `batches/${row.id}.zip`, expiresAt: row.zipExpiresAt!.toISOString(), sizeKnown: row.zipSizeBytes !== null })),
      nextPdfCursor: pdfHasMore ? pdfPage.at(-1)?.id ?? null : null,
      nextZipCursor: zipHasMore ? zipPage.at(-1)?.id ?? null : null,
    };
  }

  async publicInvitation(token: string) {
    const invitationId = invitationIdFromToken(token);
    if (!invitationId) throw new NotFoundException('Invitation introuvable.');
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 }, rsvps: true },
    });
    if (!invitation || invitation.status !== InvitationStatus.GENERATED || !invitation.versions[0])
      throw new NotFoundException('Invitation introuvable.');
    const snapshot = object(invitation.versions[0].snapshot);
    const guest = object(snapshot.guestSnapshot);
    const event = object(snapshot.eventSnapshot);
    const venue = object(event.venue);
    const access = (Array.isArray(guest.access) ? guest.access : []).filter(
      (item: unknown) => object(item).isInvited === true,
    );
    const ceremonies = (Array.isArray(event.ceremonies) ? event.ceremonies : [])
      .filter((item: unknown) =>
        access.some((allowed: Obj) => allowed.ceremonyId === object(item).id),
      )
      .map((item: unknown) => {
        const ceremony = object(item);
        const allowed = access.find((entry: Obj) => entry.ceremonyId === ceremony.id);
        const rsvp = invitation.rsvps.find((row) => row.ceremonyId === ceremony.id);
        return {
          id: ceremony.id,
          name: ceremony.name ?? ceremony.title ?? '',
          startAt: ceremony.startAt ?? null,
          allowedCompanions: Math.max(0, Number(allowed?.allowedCompanions) || 0),
          response: rsvp
            ? {
                status: rsvp.status,
                attendingCompanions: rsvp.attendingCompanions,
                respondedAt: rsvp.respondedAt,
              }
            : null,
        };
      });
    if (!ceremonies.length) throw new NotFoundException('Invitation introuvable.');
    return {
      guestName: guest.fullName ?? '',
      event: {
        name: event.name ?? '',
        startAt: event.startAt ?? event.date ?? null,
        location: venue.name ?? event.location ?? '',
      },
      ceremonies,
    };
  }

  async submitRsvp(token: string, raw: unknown) {
    const invitationId = invitationIdFromToken(token);
    if (!invitationId) throw new NotFoundException('Invitation introuvable.');
    const current = await this.publicInvitation(token);
    const invitation = await this.prisma.invitation.findUniqueOrThrow({
      where: { id: invitationId },
    });
    const input = object(raw);
    const responses = input.responses;
    if (
      Object.keys(input).some((key) => key !== 'responses') ||
      !Array.isArray(responses) ||
      !responses.length ||
      responses.length > 30
    )
      throw new BadRequestException('Fournissez au moins une réponse RSVP valide.');
    const allowed = new Map(
      current.ceremonies.map((ceremony: Obj) => [ceremony.id, ceremony.allowedCompanions]),
    );
    const normalized = responses.map((entry: unknown) => {
      const response = object(entry);
      const ceremonyId = response.ceremonyId;
      const status = response.status;
      const companions = response.attendingCompanions;
      const maxValue = typeof ceremonyId === 'string' ? allowed.get(ceremonyId) : undefined;
      const maxCompanions = typeof maxValue === 'number' ? maxValue : undefined;
      if (
        Object.keys(response).some(
          (key) => !['ceremonyId', 'status', 'attendingCompanions'].includes(key),
        ) ||
        typeof ceremonyId !== 'string' ||
        maxCompanions === undefined ||
        (status !== 'ACCEPTED' && status !== 'DECLINED') ||
        typeof companions !== 'number' ||
        !Number.isInteger(companions) ||
        companions < 0 ||
        companions > maxCompanions ||
        (status === 'DECLINED' && companions !== 0)
      )
        throw new BadRequestException(
          'Une réponse ne correspond pas aux autorisations de cette invitation.',
        );
      return { ceremonyId, status: status as RsvpStatus, attendingCompanions: companions };
    });
    if (new Set(normalized.map((entry) => entry.ceremonyId)).size !== normalized.length)
      throw new BadRequestException('Une cérémonie apparaît plusieurs fois.');
    const saved = await this.prisma.$transaction(async (tx) => {
      const result = [];
      for (const response of normalized)
        result.push(
          await tx.invitationRsvp.upsert({
            where: { invitationId_ceremonyId: { invitationId, ceremonyId: response.ceremonyId } },
            create: { invitationId, ...response },
            update: { ...response, respondedAt: new Date() },
          }),
        );
      await tx.outboxMessage.create({
        data: {
          eventType: 'invitation.rsvp.updated.v1',
          aggregateId: invitationId,
          payload: {
            invitationId,
            eventId: invitation.eventId,
            ownerSubject: invitation.ownerSubject,
            responseCount: normalized.length,
          },
        },
      });
      return result;
    });
    return {
      responses: saved.map((row) => ({
        ceremonyId: row.ceremonyId,
        status: row.status,
        attendingCompanions: row.attendingCompanions,
        respondedAt: row.respondedAt,
      })),
    };
  }

  async checkIn(
    owner: string,
    eventId: string,
    ceremonyId: string,
    token: string,
    companionCount: number,
    operatorSubject = owner,
  ) {
    if (
      !uuid.test(eventId) ||
      !uuid.test(ceremonyId) ||
      !Number.isInteger(companionCount) ||
      companionCount < 0
    )
      throw new BadRequestException('Paramètres de pointage invalides.');
    const invitationId = invitationIdFromToken(token);
    if (!invitationId) throw new NotFoundException('Invitation introuvable.');
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, eventId, ownerSubject: owner, status: InvitationStatus.GENERATED },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!invitation || !invitation.versions[0])
      throw new NotFoundException('Invitation introuvable pour cet événement.');
    const snapshot = object(invitation.versions[0].snapshot);
    const guest = object(snapshot.guestSnapshot);
    const access = (Array.isArray(guest.access) ? guest.access : []).find(
      (item: unknown) => object(item).ceremonyId === ceremonyId && object(item).isInvited === true,
    );
    if (!access)
      throw new ForbiddenException('Cet invité ne figure pas sur la liste de cette cérémonie.');
    const maxCompanions = Math.max(0, Number(object(access).allowedCompanions) || 0);
    if (companionCount > maxCompanions)
      throw new BadRequestException('Le nombre d’accompagnants dépasse l’autorisation.');
    const prior = await this.prisma.invitationCheckIn.findUnique({
      where: { invitationId_ceremonyId: { invitationId, ceremonyId } },
    });
    if (prior)
      return {
        alreadyCheckedIn: true,
        guestName: guest.fullName ?? '',
        checkedAt: prior.checkedAt,
        companionCount: prior.companionCount,
        allowedCompanions: maxCompanions,
      };
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.invitationCheckIn.create({
          data: { invitationId, ceremonyId, checkedBy: operatorSubject, companionCount },
        });
        await tx.outboxMessage.create({
          data: {
            eventType: 'invitation.checkin.created.v1',
            aggregateId: created.id,
            payload: {
              eventId,
              ceremonyId,
              ownerSubject: owner,
              operatorSubject,
              checkedAt: created.checkedAt.toISOString(),
              schemaVersion: 1,
            },
          },
        });
        return created;
      });
      return {
        alreadyCheckedIn: false,
        guestName: guest.fullName ?? '',
        checkedAt: row.checkedAt,
        companionCount: row.companionCount,
        allowedCompanions: maxCompanions,
      };
    } catch {
      const row = await this.prisma.invitationCheckIn.findUnique({
        where: { invitationId_ceremonyId: { invitationId, ceremonyId } },
      });
      if (!row) throw new ConflictException('Le pointage n’a pas pu être enregistré.');
      return {
        alreadyCheckedIn: true,
        guestName: guest.fullName ?? '',
        checkedAt: row.checkedAt,
        companionCount: row.companionCount,
        allowedCompanions: maxCompanions,
      };
    }
  }

  async checkInSummary(owner: string, eventId: string, ceremonyId: string) {
    if (!uuid.test(eventId) || !uuid.test(ceremonyId))
      throw new BadRequestException('Paramètres de cérémonie invalides.');
    const checkInWhere = { ceremonyId, invitation: { eventId, ownerSubject: owner } };
    const [checkedIn, checkIns, accepted] = await Promise.all([
      this.prisma.invitationCheckIn.count({ where: checkInWhere }),
      this.prisma.invitationCheckIn.findMany({
        where: checkInWhere,
        orderBy: { checkedAt: 'desc' },
        take: 50,
        include: {
          invitation: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } },
        },
      }),
      this.prisma.invitationRsvp.count({
        where: { ceremonyId, status: 'ACCEPTED', invitation: { eventId, ownerSubject: owner } },
      }),
    ]);
    return {
      checkedIn,
      accepted,
      recent: checkIns.map((row) => ({
        guestName:
          object(object(row.invitation.versions[0]?.snapshot).guestSnapshot).fullName ?? '',
        checkedAt: row.checkedAt,
        companionCount: row.companionCount,
      })),
    };
  }

  private async work() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.retryPendingReservationReleases();
      await this.consumeRenderQueue();
      await this.prisma.batchItem.updateMany({
        where: {
          status: BatchItemStatus.GENERATING,
          attempts: { lt: 3 },
          updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
          batch: { is: { status: { in: [BatchStatus.QUEUED, BatchStatus.GENERATING] } } },
        },
        data: { status: BatchItemStatus.QUEUED, errorCode: 'REQUEUED_AFTER_WORKER_RESTART' },
      });
      await this.prisma.batchItem.updateMany({
        where: {
          status: BatchItemStatus.GENERATING,
          attempts: { gte: 3 },
          updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
          batch: { is: { status: { in: [BatchStatus.QUEUED, BatchStatus.GENERATING] } } },
        },
        data: { status: BatchItemStatus.FAILED, errorCode: 'RENDER_FAILED' },
      });
      const batches = await this.prisma.invitationBatch.findMany({
        where: { status: { in: [BatchStatus.QUEUED, BatchStatus.GENERATING] } },
        orderBy: { createdAt: 'asc' },
        take: 2,
        include: {
          items: {
            where: {
              OR: [
                { status: BatchItemStatus.QUEUED },
                { status: BatchItemStatus.FAILED, attempts: { lt: 3 } },
              ],
            },
            take: 8,
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      for (const batch of batches) {
        const active = await this.prisma.invitationBatch.updateMany({
          where: { id: batch.id, status: { in: [BatchStatus.QUEUED, BatchStatus.GENERATING] } },
          data: { status: BatchStatus.GENERATING },
        });
        if (!active.count) continue;
        await Promise.all(
          batch.items.map(async (item) => {
            try {
              const claim = await this.prisma.batchItem.updateMany({
                where: {
                  id: item.id,
                  status: { in: [BatchItemStatus.QUEUED, BatchItemStatus.FAILED] },
                  attempts: { lt: 3 },
                },
                data: {
                  status: BatchItemStatus.GENERATING,
                  attempts: { increment: 1 },
                  errorCode: null,
                },
              });
              if (!claim.count) return;
              const latestBefore = await this.prisma.invitationBatch.findUniqueOrThrow({
                where: { id: batch.id },
                select: { status: true },
              });
              if (latestBefore.status === BatchStatus.CANCELLED) {
                await this.prisma.batchItem.update({
                  where: { id: item.id },
                  data: { status: BatchItemStatus.CANCELLED, errorCode: 'BATCH_CANCELLED' },
                });
                return;
              }
              const pdf = await this.render(object(item.snapshot));
              const key = `pdf/${batch.id}/${item.guestId}.pdf`;
              await this.storage.put(key, pdf, 'application/pdf');
              const committed = await this.prisma.$transaction(async (tx) => {
                const activeBatch = await tx.invitationBatch.updateMany({
                  where: {
                    id: batch.id,
                    status: { in: [BatchStatus.QUEUED, BatchStatus.GENERATING] },
                  },
                  data: { completedItems: { increment: 1 } },
                });
                if (!activeBatch.count) {
                  await tx.batchItem.update({
                    where: { id: item.id },
                    data: { status: BatchItemStatus.CANCELLED, errorCode: 'BATCH_CANCELLED' },
                  });
                  return false;
                }
                await tx.batchItem.update({
                  where: { id: item.id },
                  data: { status: BatchItemStatus.GENERATED, objectKey: key, sizeBytes: BigInt(pdf.byteLength) },
                });
                await tx.invitation.update({
                  where: { id: item.invitationId },
                  data: { status: InvitationStatus.GENERATED },
                });
                return true;
              });
              if (!committed) await this.storage.delete(key);
            } catch {
              const attempt = item.attempts + 1;
              await this.prisma.$transaction([
                this.prisma.batchItem.update({
                  where: { id: item.id },
                  data: {
                    status: attempt >= 3 ? BatchItemStatus.FAILED : BatchItemStatus.QUEUED,
                    errorCode: attempt >= 3 ? 'RENDER_FAILED' : 'RETRYING',
                  },
                }),
                ...(attempt >= 3
                  ? [
                      this.prisma.invitationBatch.update({
                        where: { id: batch.id },
                        data: { failedItems: { increment: 1 } },
                      }),
                    ]
                  : []),
              ]);
            }
          }),
        );
        await this.finishIfDone(batch.id);
      }
    } finally {
      this.busy = false;
    }
  }
  private async consumeRenderQueue() {
    const api = process.env['RABBITMQ_MANAGEMENT_URL'];
    const user = process.env['RABBITMQ_USER'];
    const password = process.env['RABBITMQ_PASSWORD'];
    if (!api || !user || !password) return;
    const response = await fetch(
      `${api.replace(/\/$/, '')}/api/queues/%2F/invitation.render.jobs/get`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          count: 5,
          ackmode: 'ack_requeue_false',
          encoding: 'auto',
          truncate: 128_000,
        }),
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) return;
    const messages: unknown = await response.json();
    if (!Array.isArray(messages)) return;
    // The durable database batch/item records are the recovery source if a worker exits after ack.
    for (const message of messages) {
      const envelope = object(
        JSON.parse(
          typeof object(message).payload === 'string' ? (object(message).payload as string) : '{}',
        ),
      );
      if (envelope['eventType'] !== 'invitation.render.requested.v1') continue;
    }
  }
  private async finishIfDone(id: string) {
    const items = await this.prisma.batchItem.findMany({ where: { batchId: id } });
    if (
      items.some(
        (i) => i.status === BatchItemStatus.QUEUED || i.status === BatchItemStatus.GENERATING,
      )
    )
      return;
    const batch = await this.prisma.invitationBatch.findUniqueOrThrow({ where: { id } });
    if (batch.status === BatchStatus.CANCELLED) {
      await this.cleanupRenderAssets(items[0]?.snapshot);
      return;
    }
    const made = items.filter((i) => i.status === BatchItemStatus.GENERATED);
    const failed = items.filter((i) => i.status === BatchItemStatus.FAILED).length;
    try {
      if (failed)
        await Promise.all(
          made.flatMap((i) => (i.objectKey ? [this.storage.delete(i.objectKey)] : [])),
        );
      if (!failed && made.length) {
        const event = object(object(made[0]!.snapshot).eventSnapshot);
        const readme = await renderStaticPdf(`<!doctype html><html lang="fr"><meta charset="utf-8"><style>@page{size:A4;margin:22mm}body{font:12pt Arial,sans-serif;color:#29251f;line-height:1.55}h1{font: bold 26pt Georgia;color:#684d3e;margin:0 0 8mm}h2{font: bold 15pt Georgia;color:#684d3e;margin:9mm 0 3mm}.meta{color:#655d57;border-bottom:1px solid #d8cabc;padding-bottom:5mm}.box{background:#f7f1e7;padding:5mm;border-radius:3mm}li{margin:2mm 0}small{color:#675f59}</style><h1>Votre lot d’invitations</h1><p class="meta">${esc(event.name ?? 'Événement')} · ${made.length} invitation${made.length > 1 ? 's' : ''}</p><div class="box">Cette archive contient les invitations personnalisées au format PDF. Chaque fichier correspond à un invité et inclut son code QR privé lorsque celui-ci est activé pour l’invitation.</div><h2>Ouvrir les invitations</h2><ol><li>Décompressez le fichier ZIP sur votre téléphone ou ordinateur.</li><li>Ouvrez le dossier <b>invitations</b>.</li><li>Chaque PDF porte le nom de l’invité. Vous pouvez ensuite l’imprimer ou le partager individuellement.</li></ol><h2>Réponses des invités</h2><p>Les invités peuvent utiliser le code QR de leur PDF pour consulter l’invitation et répondre en ligne. Conservez les PDF privés et transmettez chacun uniquement à la personne concernée.</p><h2>Besoin d’aide ?</h2><p>Retrouvez le lot dans InvitaFlow, dans la page des invitations de l’événement. Le ZIP n’est disponible qu’après la fin complète du rendu.</p><small>Document généré automatiquement par InvitaFlow.</small></html>`);
        const zip = createZip(
          await Promise.all(
            made.map(async (i) => ({
              name: `invitations/${safeGuestFilename(object(object(i.snapshot).guestSnapshot).fullName)}--${i.guestId.slice(0, 8)}.pdf`,
              bytes: await this.storage.get(i.objectKey!),
            })),
          ).then((files) => [...files, { name: 'LISEZ-MOI.pdf', bytes: readme }]),
        );
        await this.storage.put(`batches/${id}.zip`, zip, 'application/zip');
        await this.prisma.invitationBatch.update({ where: { id }, data: { zipSizeBytes: BigInt(zip.byteLength) } });
      }
      await this.cleanupRenderAssets(items[0]?.snapshot);
      await this.settle(batch, failed ? 0 : made.length);
      const zipTtlDays = Math.max(1, Math.min(365, Number(process.env['STORAGE_ZIP_TTL_DAYS'] ?? 5)));
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.invitationBatch.updateMany({
          where: { id, status: { in: [BatchStatus.QUEUED, BatchStatus.GENERATING] } },
          data: {
            status: failed ? BatchStatus.FAILED : BatchStatus.COMPLETED,
            completedItems: failed ? 0 : made.length,
            failedItems: failed ? items.length : 0,
            zipExpiresAt: failed || !made.length ? null : new Date(Date.now() + zipTtlDays * 24 * 60 * 60 * 1000),
            zipDeletedAt: null,
          },
        });
        if (changed.count)
          await tx.outboxMessage.create({
            data: {
              eventType: failed ? 'invitation.batch.failed.v1' : 'invitation.batch.completed.v1',
              aggregateId: id,
              payload: {
                batchId: id,
                eventId: batch.eventId,
                ownerSubject: batch.ownerSubject,
                generatedCount: failed ? 0 : made.length,
                failedCount: failed ? items.length : 0,
                occurredAt: new Date().toISOString(),
                schemaVersion: 1,
              },
            },
          });
      });
      if (failed)
        await this.prisma.batchItem.updateMany({
          where: { batchId: id, status: BatchItemStatus.GENERATED },
          data: { status: BatchItemStatus.FAILED, objectKey: null, errorCode: 'BATCH_ROLLED_BACK' },
        });
    } catch {
      /* Leave the batch generating; the next worker tick retries finalization idempotently. */
    }
  }
  private async render(snapshot: Obj): Promise<Buffer> {
    const event = object(snapshot.eventSnapshot);
    const guest = object(snapshot.guestSnapshot);
    const design = object(snapshot.designSnapshot);
    const doc = object(design.document);
    const venue = object(event.venue);
    const ceremonyText = (
      Array.isArray(snapshot.ceremonySnapshots) ? snapshot.ceremonySnapshots : []
    )
      .map((v: unknown) => {
        const c = object(object(v).ceremony);
        return `<p>${esc(c.name ?? c.title ?? '')} ${esc(c.startAt ?? '')}</p>`;
      })
      .join('');
    const guestName = String(guest.fullName ?? '');
    const eventName = String(event.name ?? '');
    const eventDate = String(event.startAt ?? event.date ?? '');
    const eventLocation = String(venue.name ?? event.location ?? '');
    const seating = Array.isArray(snapshot.seatingSnapshot) ? snapshot.seatingSnapshot.map(object) : [];
    const tableName = [...new Set(seating.map((item) => item.tableName).filter((name): name is string => typeof name === 'string' && !!name.trim()))].join(' · ');
    const ceremonyName = (Array.isArray(snapshot.ceremonySnapshots) ? snapshot.ceremonySnapshots : []).map((item: unknown) => {
      const ceremony = object(object(item).ceremony);
      return String(ceremony.name ?? ceremony.title ?? '');
    }).filter(Boolean).join(' · ');
    const variables: Record<string, string> = {
      'guest.name': guestName,
      'guest.fullname': guestName,
      'guest.email': String(guest.email ?? ''),
      'event.name': eventName,
      'event.date': eventDate,
      'event.location': eventLocation,
      guest_name: guestName,
      guestname: guestName,
      guest_full_name: guestName,
      table_name: tableName,
      tablename: tableName,
      tableName,
      guest_email: String(guest.email ?? ''),
      event_name: eventName,
      eventname: eventName,
      event_date: eventDate,
      event_location: eventLocation,
      ceremony_name: ceremonyName,
      rsvp_link: `${requiredEnv('PUBLIC_WEB_URL').replace(/\/$/, '')}/invite/${invitationToken(String(snapshot.invitationId ?? ''))}`,
      qr_code: `${requiredEnv('PUBLIC_WEB_URL').replace(/\/$/, '')}/invite/${invitationToken(String(snapshot.invitationId ?? ''))}`,
    };
    for (const variable of Array.isArray(doc.variables) ? doc.variables : []) {
      const v = object(variable);
      if (typeof v.key === 'string' && typeof v.defaultValue === 'string') {
        const identity = `${v.key} ${typeof v.label === 'string' ? v.label : ''}`.toLocaleLowerCase(
          'fr',
        );
        variables[v.key] =
          /guest|invite/.test(identity) && /name|nom/.test(identity)
            ? guestName
            : /event|evenement/.test(identity) && /name|nom/.test(identity)
              ? eventName
              : /event|evenement/.test(identity) && /date/.test(identity)
                ? eventDate
          : /table/.test(identity) && /name|nom/.test(identity)
            ? tableName
            : /event|evenement/.test(identity) && /location|lieu|adresse/.test(identity)
                  ? eventLocation
                  : v.defaultValue;
      }
    }
    const substitute = (text: string) =>
      text.replace(
        /\{\{\s*([^}]+)\s*\}\}/g,
        (_, key: string) => variables[key.trim()] ?? variables[key.trim().toLowerCase()] ?? '',
      );
    const canvas = object(doc.canvas);
    const width = Number(canvas.width) || 1080;
    const height = Number(canvas.height) || 1530;
    const renderAssets = object(snapshot.renderAssets);
    const resolvedLayout = object(snapshot.resolvedLayout);
    const renderElements = Array.isArray(resolvedLayout.elements) ? resolvedLayout.elements : Array.isArray(doc.elements) ? doc.elements : [];
    const token = invitationToken(String(snapshot.invitationId ?? ''));
    const qrTarget = `${requiredEnv('PUBLIC_WEB_URL').replace(/\/$/, '')}/invite/${token}`;
    const imageData = new Map<string, string>();
    for (const value of renderElements) {
      const layer = object(value);
      if (layer.type !== 'IMAGE' || typeof layer.assetId !== 'string' || imageData.has(layer.assetId)) continue;
      const entry: unknown = renderAssets[layer.assetId];
      const key = typeof entry === 'string' ? entry : object(entry)['key'];
      const mimeType = typeof entry === 'string' ? 'image/webp' : object(entry)['mimeType'];
      if (typeof key !== 'string' || !['image/webp', 'image/png'].includes(String(mimeType))) throw new Error('Invitation image snapshot is missing');
      imageData.set(layer.assetId, await this.renderImageSource(key, String(mimeType)));
    }
    const legacyLayers = renderElements
      .map((value: unknown) => {
        const layer = object(value);
        const x = Number(layer.x) || 0;
        const y = Number(layer.y) || 0;
        const w = Number(layer.width) || 0;
        const h = Number(layer.height) || 0;
        const rotate = Number(layer.rotation) || 0;
        const transform = rotate ? ` transform="rotate(${rotate} ${x + w / 2} ${y + h / 2})"` : '';
        if (layer.type === 'QR') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"${transform}/><image href="file://${'QR_FILE'}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"${transform}/>`;
        if (layer.type === 'IMAGE') {
          const assetId = String(layer.assetId ?? '');
          const href = imageData.get(assetId);
          if (!href) throw new Error('Invitation image snapshot is unavailable');
          return renderInvitationImage(layer, href);
        }
        if (layer.type === 'BACKGROUND' || layer.type === 'SHAPE')
          return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${esc(layer.fill === 'transparent' ? 'none' : (layer.fill ?? 'none'))}" stroke="${esc(layer.stroke ?? 'none')}" stroke-width="${Number(layer.strokeWidth) || 0}"${transform}/>`;
        if (layer.type !== 'TEXT' || typeof layer.text !== 'string') return '';
        const align = layer.align === 'left' ? 'start' : layer.align === 'right' ? 'end' : 'middle';
        const tx = layer.align === 'left' ? x : layer.align === 'right' ? x + w : x + w / 2;
        const renderedText = layer.binding === 'qr.url' ? qrTarget : typeof layer.resolvedText === 'string' ? layer.resolvedText : substitute(layer.text);
        if (!renderedText.trim() && layer.hideWhenEmpty) return '';
        const fit = Array.isArray(layer.resolvedLines) && typeof layer.resolvedFontSize === 'number'
          ? { fontSize: layer.resolvedFontSize, lines: layer.resolvedLines as string[], lineHeight: Number(layer.lineHeight) || 1.2, overflow: false }
          : fitInvitationText(layer, renderedText);
        if (fit.overflow) throw new Error(`Invitation text overflow: ${String(layer.id ?? '')}`);
        const fontSize = fit.fontSize;
        const firstY = y + h / 2 - (fit.lines.length - 1) * fontSize * fit.lineHeight / 2;
        return `<text x="${tx}" y="${firstY}" text-anchor="${align}" dominant-baseline="middle" font-family="${esc(object(layer.resolvedFont).family ?? layer.fontFamily ?? 'Georgia')}" font-size="${fontSize}" font-weight="${Number(layer.fontWeight) || 400}" fill="${esc(layer.color ?? '#29251f')}"${transform}>${fit.lines.map((line: string, index: number) => `<tspan x="${tx}" dy="${index ? fontSize * fit.lineHeight : 0}">${esc(line)}</tspan>`).join('')}</text>`;
      })
      .join('');
    const layers = doc.schemaVersion === 2 && Array.isArray(resolvedLayout.elements)
      ? renderResolvedLayoutSvg({ ...resolvedLayout, elements: resolvedLayout.elements.map((element: Obj) => element.binding === 'qr.url' ? { ...element, resolvedText: qrTarget, resolvedLines: [qrTarget] } : element) } as never, { assets: Object.fromEntries(imageData), qrHref: 'file://QR_FILE' })
      : legacyLayers;
    const designBackground = esc(object(object(doc.theme).tokens).background ?? '#fffdf9');
    const hasDesignQr = renderElements.some((item: unknown) => object(item).type === 'QR');
    const html = `<!doctype html><meta charset="utf-8"><style>@page{size:A5;margin:0}html,body{margin:0;width:148mm;height:210mm;background:${designBackground};overflow:hidden}svg{display:block;width:148mm;height:210mm}.fallback{box-sizing:border-box;width:148mm;height:210mm;padding:25mm 16mm;text-align:center;font:22px Georgia,serif}.fallback h1{font-size:34px}.qr{position:fixed;right:8mm;bottom:8mm;width:27mm;height:27mm;background:#fff;padding:1mm}.qr svg{width:100%;height:100%}</style>${layers ? (doc.schemaVersion === 2 && Array.isArray(resolvedLayout.elements) ? layers : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">${layers}</svg>`) : `<div class="fallback"><h1>${esc(event.name ?? 'Invitation')}</h1><p>${esc(guest.fullName ?? 'Cher invité')}</p><p>${esc(event.startAt ?? event.date ?? '')}</p><p>${esc(venue.name ?? event.location ?? '')}</p>${ceremonyText}</div>`}${hasDesignQr ? '' : `<div class="qr" aria-label="QR de réponse"><img src="file://${'QR_FILE'}" alt="Répondre à l’invitation" /></div>`}`;
    const dir = await mkdtemp(join(tmpdir(), 'invitaflow-render-'));
    const input = join(dir, 'invitation.html');
    const output = join(dir, 'invitation.pdf');
    try {
      const qr = join(dir, 'invitation-qr.svg');
      await (
        await import('node:fs/promises')
      ).writeFile(input, html.replaceAll('QR_FILE', qr), 'utf8');
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.env['QR_ENCODE_PATH'] ?? '/usr/bin/qrencode',
          ['-t', 'SVG', '-m', '4', '-o', qr, qrTarget],
          { stdio: 'ignore' },
        );
        child.once('error', reject);
        child.once('exit', (code) => {
          if (code === 0) resolve();
          else reject(new Error('QR generation failed'));
        });
      });
      const executable = process.env['CHROMIUM_PATH'] ?? '/usr/bin/chromium-browser';
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          executable,
          [
            '--headless',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            `--print-to-pdf=${output}`,
            `file://${input}`,
          ],
          { stdio: 'ignore' },
        );
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('Render timeout'));
        }, 30000);
        child.once('error', (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error('Chromium render failed'));
        });
      });
      return await readFile(output);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

function createZip(files: { name: string; bytes: Buffer }[]) {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 255]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const sum = crc(f.bytes);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(sum, 14);
    h.writeUInt32LE(f.bytes.length, 18);
    h.writeUInt32LE(f.bytes.length, 22);
    h.writeUInt16LE(name.length, 26);
    local.push(h, name, f.bytes);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(sum, 16);
    c.writeUInt32LE(f.bytes.length, 20);
    c.writeUInt32LE(f.bytes.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += h.length + name.length + f.bytes.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}
