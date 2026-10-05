import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MASK_REGISTRY, readPrivateImageDimensions, renderResolvedLayoutSvg, resolveDesignLayout } from '../packages/design-document/src/index.mjs';
import { visualFixture, VISUAL_CASES } from '../packages/design-document/test/fixtures/visual-v2.mjs';
import { syntheticPng } from '../packages/design-document/test/fixtures/synthetic-png.mjs';

// QA only. Uses an existing Playwright runtime and an explicitly chosen local Chromium executable.
const args = Object.fromEntries(process.argv.slice(2).map((arg) => { const split = arg.indexOf('='); return [arg.slice(0, split), arg.slice(split + 1)]; }));
if (!args['--modules'] || !args['--browser']) throw new Error('Provide --modules=<existing node_modules> and --browser=<existing Chromium executable>');
const { chromium } = createRequire(join(resolve(args['--modules']), '__visual_runtime.cjs'))('playwright');
const output = resolve(args['--output'] ?? join(tmpdir(), 'invitaflow-visual-phase3'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: args['--browser'], headless: true });
const report = { measuredAt: new Date().toISOString(), browser: browser.version(), cases: [] };
try {
  const page = await browser.newPage({ viewport: { width: 560, height: 794 }, deviceScaleFactor: 1 });
  for (const id of [...VISUAL_CASES, ...Object.keys(MASK_REGISTRY).map((mask) => `mask-${mask}`)]) {
    const doc = visualFixture(id.startsWith('mask-') ? 'C' : id);
    const assets = {};
    for (const layer of doc.elements.filter((layer) => layer.type === 'IMAGE')) {
      const landscape = layer.sourceWidth > layer.sourceHeight, width = landscape ? 1600 : 1200, height = landscape ? 800 : 1600;
      const assetId = `${layer.assetId}-${layer.id}`;
      layer.assetId = assetId; layer.sourceWidth = width; layer.sourceHeight = height;
      assets[assetId] = `data:image/png;base64,${syntheticPng(width, height, id === 'G' || layer.role === 'DECORATION').toString('base64')}`;
      if (id === 'G' && args['--alpha-webp']) {
        const bytes = await readFile(args['--alpha-webp']);
        const dimensions = readPrivateImageDimensions(bytes, 'image/webp');
        layer.sourceWidth = dimensions.width; layer.sourceHeight = dimensions.height;
        assets[assetId] = `data:image/webp;base64,${bytes.toString('base64')}`;
      }
      if (id.startsWith('mask-') && layer.role === 'FOREGROUND') { layer.maskId = id.slice(5); layer.overlay = { type: 'solid', color: '#FFFFFF', opacity: 0.15 }; }
    }
    const layout = resolveDesignLayout(doc, { guest: { name: 'Éléonore — invitation de test' } }, undefined, assets);
    if (layout.errors.length) throw new Error(`${id}: ${JSON.stringify(layout.errors)}`);
    const svg = renderResolvedLayoutSvg(layout, { assets });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A5;margin:0}html,body{margin:0;width:148mm;height:210mm;background:#f5f0e8}svg{display:block;width:148mm;height:210mm}</style></head><body>${svg}</body></html>`;
    const path = join(output, `${id}.html`); await writeFile(path, html);
    await page.goto(pathToFileURL(path).href);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.querySelectorAll('image')].map(async (element) => { const image = new Image(); image.src = element.href.baseVal; await image.decode(); })); });
    await page.screenshot({ path: join(output, `${id}-preview.png`) });
    await page.pdf({ path: join(output, `${id}.pdf`), preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    const bounds = await page.locator('svg').evaluate((svg) => { const rect = svg.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
    report.cases.push({ id, errors: layout.errors, warnings: layout.warnings, bounds, images: Object.keys(assets).length, assetMimeTypes: Object.values(assets).map((href) => /^data:([^;]+);/.exec(href)?.[1]) });
  }
} finally { await browser.close(); await writeFile(join(output, 'runtime-report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ output, browser: report.browser, cases: report.cases.length }));
