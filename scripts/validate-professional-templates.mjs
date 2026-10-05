import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createProfessionalTemplate, PROFESSIONAL_TEMPLATE_IDS, resolveDesignLayout, renderResolvedLayoutSvg, readPrivateImageDimensions } from '../packages/design-document/src/index.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const split = arg.indexOf('='); return [arg.slice(0, split), arg.slice(split + 1)]; }));
if (!args['--modules'] || !args['--browser']) throw new Error('Provide --modules and --browser');
const { chromium } = createRequire(join(resolve(args['--modules']), '__professional_runtime.cjs'))('playwright');
const output = resolve(args['--output'] ?? join(tmpdir(), 'invitaflow-templates-phase4'));
await mkdir(output, { recursive: true });
const photo = await readFile(new URL('../docs/template-assets/catalogue-demo-photo-v1.png', import.meta.url));
const branch = await readFile(new URL('../docs/template-assets/botanical-branch-v1.png', import.meta.url));
// Local QA UUIDs only; never sent to a production API or seeded into the database.
const photoId = '550e8400-e29b-41d4-a716-446655440000';
const branchId = '550e8400-e29b-41d4-a716-446655440001';
const dimensions = readPrivateImageDimensions(photo, 'image/png');
const branchDimensions = readPrivateImageDimensions(branch, 'image/png');
const assets = { [photoId]: `data:image/png;base64,${photo.toString('base64')}`, [branchId]: `data:image/png;base64,${branch.toString('base64')}` };
const browser = await chromium.launch({ executablePath: args['--browser'], headless: true });
const report = { measuredAt: new Date().toISOString(), browser: browser.version(), demoOnly: true, cases: [] };
try {
  const page = await browser.newPage({ viewport: { width: 560, height: 794 }, deviceScaleFactor: 1 });
  for (const family of PROFESSIONAL_TEMPLATE_IDS) for (let count = 1; count <= 4; count++) {
    const id = `${family}-${count}`;
    const document = createProfessionalTemplate(family, { mainPhoto: { assetId: photoId, ...dimensions }, ...(family === 'photo-editorial-luxury' ? { backgroundPhoto: { assetId: photoId, ...dimensions } } : {}) }, { botanicalBranch: { assetId: branchId, ...branchDimensions } });
    const snapshot = { guest: { name: 'Camille & Alex — DEMO' }, table: { name: 'Table Jardin' }, event: { title: 'CATALOGUE DEMO', coupleNames: 'Alex & Camille', date: '12 septembre 2030', invitationText: 'Nous serons heureux de vous retrouver pour une journée de joie et de partage, entourés de celles et ceux qui nous sont chers.' }, contact: { value: 'Contact DEMO' }, ceremonies: Array.from({ length: count }, (_, index) => ({ name: ['Union civile', 'Célébration', 'Réception', 'Soirée'][index], date: '12 septembre', time: '14:00', venue: 'Jardin des Horizons', address: '12 avenue des Jardins', reference: 'Entrée principale', dressCode: 'Élégance naturelle' })) };
    const layout = resolveDesignLayout(document, snapshot, undefined, assets);
    if (layout.errors.length) throw new Error(`${id}: ${JSON.stringify(layout.errors)}`);
    const svg = renderResolvedLayoutSvg(layout, { assets });
    await writeFile(join(output, `${id}.svg`), svg);
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A5;margin:0}html,body{margin:0;width:148mm;height:210mm}svg{display:block;width:148mm;height:210mm}</style></head><body>${svg}</body></html>`;
    const path = join(output, `${id}.html`); await writeFile(path, html);
    await page.goto(pathToFileURL(path).href);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('image')].map(async (element) => { const image = new Image(); image.src = element.href.baseVal; await image.decode(); })); });
    await page.screenshot({ path: join(output, `${id}-preview.png`) });
    await page.pdf({ path: join(output, `${id}.pdf`), preferCSSPageSize: true, printBackground: true });
    report.cases.push({ id, variant: layout.variantId, errors: layout.errors, warnings: layout.warnings });
  }
} finally { await browser.close(); }
await writeFile(join(output, 'runtime-report.json'), JSON.stringify(report, null, 2));
console.info(JSON.stringify({ output, cases: report.cases.length, browser: report.browser }));
