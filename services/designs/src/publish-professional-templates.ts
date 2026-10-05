import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import { PROFESSIONAL_RECIPES, createProfessionalTemplate } from '@invitaflow/design-document';
import { normalizeDesignDocument, validateDesignDocument } from './design-document.js';
import { readFile } from 'node:fs/promises';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

async function main() {
  const manifestPath = process.argv.find((arg) => arg.startsWith('--assets='))?.slice(9);
  const privateAssets = manifestPath ? JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, { assetId: string; width: number; height: number }> : {};
  if (process.argv.includes('--publish') && !privateAssets['botanicalBranch']) throw new Error('Publish requires --assets=<private Media manifest> for the original botanical decoration');
  const documents = PROFESSIONAL_RECIPES.map(({ id: slug }) => ({ slug, document: validateDesignDocument(normalizeDesignDocument(createProfessionalTemplate(slug, {}, privateAssets))) }));
  if (!process.argv.includes('--publish')) {
    console.info(JSON.stringify({ mode: 'validation-only', templates: documents.map(({ slug, document }) => ({ slug, variants: (document['layoutVariants'] as unknown[]).length, name: (document['metadata'] as { name: string }).name })), note: 'Use --publish with the Designs DATABASE_URL and verified private assets. No database changes made.' }, null, 2));
    return;
  }
  if (!process.env['DATABASE_URL']) throw new Error('The Designs DATABASE_URL is required');
  if ((process.env['STORAGE_MONITOR_TOKEN'] ?? '').length < 32) throw new Error('The existing STORAGE_MONITOR_TOKEN must be configured for private template decoration access');
  const token = process.env['TEMPLATE_ASSET_TOKEN'];
  if (!token) throw new Error('TEMPLATE_ASSET_TOKEN is required to verify private assets before publication');
  for (const asset of Object.values(privateAssets)) {
    const response = await fetch(`${(process.env['MEDIA_BASE_URL'] ?? 'http://127.0.0.1:3014').replace(/\/$/, '')}/v1/assets/${encodeURIComponent(asset.assetId)}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('A private template decoration cannot be verified by Media');
    const metadata = await response.json() as { status: string; width: number; height: number };
    if (metadata.status !== 'READY' || metadata.width !== asset.width || metadata.height !== asset.height) throw new Error('Private Media asset is not ready or its geometry changed');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) });
  try {
    for (const { slug, document } of documents) await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`professional-template:${slug}`}))`);
      const existing = await tx.designTemplate.findUnique({ where: { slug }, include: { versions: true } });
      const current = existing?.versions.find((item) => item.version === existing.version);
      if (existing && !current) throw new Error(`Missing immutable version for ${slug}`);
      if (current && canonical(current.document) === canonical(document)) { console.info(`${slug}: already published`); return; }
      if (existing && !process.argv.includes('--new-version')) throw new Error(`${slug}: changed composition requires --new-version`);
      const version = existing ? existing.version + 1 : 1;
      const metadata = document['metadata'] as { name: string };
      const theme = document['theme'] as { palette: string[] };
      const data = { name: metadata.name, description: 'Composition portrait A5. Photos privées, programme dynamique et personnalisation guidée.', category: 'WEDDING' as const, style: slug, tags: ['A5', 'V2', 'PROFESSIONAL'], preview: { background: theme.palette[0], accent: theme.palette[1], style: slug }, document: document as Prisma.InputJsonValue, version };
      const template = existing ? await tx.designTemplate.update({ where: { id: existing.id }, data }) : await tx.designTemplate.create({ data: { slug, ...data } });
      await tx.designTemplateVersion.create({ data: { templateId: template.id, version, ceremonyTypes: ['UNIVERSAL'], document: document as Prisma.InputJsonValue } });
      await tx.outboxMessage.create({ data: { eventType: 'design.template.published.v1', aggregateId: template.id, payload: { templateId: template.id, slug, version } } });
      console.info(`${slug}: published version ${version}`);
    });
  } finally { await prisma.$disconnect(); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Publication failed'); process.exitCode = 1; });
