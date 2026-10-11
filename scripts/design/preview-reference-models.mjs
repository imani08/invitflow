import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReferenceTemplate, invitationDisplayFields, resolveDesignLayout, renderResolvedLayoutSvg, invitationPrintFormat } from '../../packages/design-document/src/index.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const i = arg.indexOf('='); return [arg.slice(0, i), arg.slice(i + 1)]; }));
if (!args['--modules'] || !args['--browser']) throw new Error('Provide existing --modules and --browser paths. No package or browser is downloaded.');
const { chromium } = createRequire(join(resolve(args['--modules']), 'reference-qa.cjs'))('playwright');
const out = resolve(args['--output'] ?? 'docs/design-references/reconstructed');
await mkdir(out, { recursive: true });
const photo = { assetId: '11111111-1111-4111-8111-111111111111', width: 1536, height: 1024 }; // QA fixture only; never a production asset.
const bytes = await readFile('docs/design-references/template-assets/catalogue-demo-photo-v1.png');
const assets = { [photo.assetId]: `data:image/png;base64,${bytes.toString('base64')}` };
const event = {
  name: 'Mariage de Lyevin et Françoise', startAt: '2026-07-26T09:00:00+01:00', timezone: 'Africa/Kinshasa',
  invitationText: 'Les Familles Kizungu et Isanganino\nsont honorées de vous convier à l’union\nde leurs enfants Lyevin et Françoise\n\nElles seront honorées de partager avec\nvous cette journée unique.',
  ceremonies: [
    { name: 'Cérémonie nuptiale', startAt: '2026-07-26T09:00:00+01:00', venue: 'Centre Torrent de Kerith', address: 'Av. des Généraux N°5, Ngaliema', dressCode: 'Dress code : tout en noir' },
    { name: 'Mariage civil', startAt: '2026-07-25T09:00:00+01:00', venue: 'Espace Crystal biothy', address: 'Av. Poto Galo N°1, Binza Pigeon', reference: 'Réf. SK', dressCode: 'Dress code : terracotta' },
  ],
};
const browser = await chromium.launch({ executablePath: args['--browser'], headless: true });
const report = { browser: browser.version(), executedAt: new Date().toISOString(), mode: 'offline-render-fixtures', realProvidersCalled: false, authenticatedJourneyValidated: false, cases: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1240, height: 1200 }, deviceScaleFactor: 1 });
  for (const [index, id] of ['reference-01-ivory', 'reference-02-gold'].entries()) {
    const doc = createReferenceTemplate(id, { mainPhoto: photo, secondaryPhoto: photo, backgroundPhoto: photo });
    if (index) doc.variables.find(variable => variable.key === 'referenceContact').defaultValue = '+243 000 000 000'; // Fictitious editable contact, QA only.
    const sample = structuredClone(event);
    if (index) sample.ceremonies = [event.ceremonies[0], { name: 'Vin d’honneur', startAt: '2026-07-26T18:30:00+01:00', venue: 'Chapiteau La Colombe', address: 'Av. Macampagne N°31', reference: 'Réf. ASK', dressCode: 'Dress code : tout en noir' }];
    const snapshot = { ...invitationDisplayFields(sample), guest: { name: index ? 'Couple Filbert' : 'Couple Mumbere' }, table: { name: index ? 'Jasmin' : 'Rose' }, contact: { value: index ? 'CONTACT\n+243 973 431 495' : '' }, qr: { available: false } };
    const layout = resolveDesignLayout(doc, snapshot, undefined, assets, { mode: 'web' });
    if (layout.errors.length) throw new Error(`${id}: ${JSON.stringify(layout.errors)}`);
    const svg = renderResolvedLayoutSvg(layout, { assets }).replace('<svg ', '<svg style="display:block;width:100%;height:auto" ');
    await page.setContent(`<html lang="fr"><meta charset="utf-8"><style>body{margin:0}#model{width:750px}</style><div id="model">${svg}</div></html>`);
    await page.locator('image').evaluateAll(async elements => { await Promise.all(elements.map(async item => { const img = new Image(); img.src = item.getAttribute('href'); await img.decode(); })); });
    await page.locator('#model').screenshot({ path: join(out, `${id}.png`) });
    const original = pathToFileURL(resolve(`docs/design-references/invitation-models/modele-invitation-0${index + 1}.jpg`)).href;
    // File navigation permits the original local reference; never an external image fetch.
    const html = `<html lang="fr"><meta charset="utf-8"><style>body{margin:0;padding:20px;background:#eee9e1;font:14px Arial;color:#29251f}main{display:flex;gap:20px}figure{margin:0;width:600px}img{display:block;width:100%}h1{font-size:22px}p{max-width:1200px;line-height:1.5}figcaption{height:40px;font-weight:bold}</style><h1>InvitaFlow · comparaison hors ligne · modèle ${index + 1}</h1><p>À droite : composition structurée. Photo de démonstration différente, ornements redessinés et police Great Vibes approchée. Aucune IA appelée. Aucun ancien texte incrusté. QR absent dans cet aperçu de composition.</p><main><figure><figcaption>Référence fournie</figcaption><img src="${original}"></figure><figure><figcaption>Reconstruction éditable · données de démonstration</figcaption>${svg}</figure></main></html>`;
    const htmlPath = join(tmpdir(), 'invitaflow-reference-qa', 'comparison.html'); await mkdir(join(tmpdir(), 'invitaflow-reference-qa'), { recursive: true }); await writeFile(htmlPath, html);
    await page.goto(pathToFileURL(htmlPath).href); await page.locator('img').evaluate(async image => { await image.decode(); });
    await page.screenshot({ path: join(out, `${id}-comparison.png`), fullPage: true });
    report.cases.push({ id, canvas: doc.canvas, printFormat: invitationPrintFormat(doc), errors: layout.errors, warnings: layout.warnings, photo: 'existing catalogue-demo-photo-v1.png, different from original', differences: doc.metadata.referenceDifferences });
  }
} finally { await browser.close(); await writeFile(join(out, 'render-report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ output: out, cases: report.cases.length, errors: report.cases.flatMap(item => item.errors).length }));
