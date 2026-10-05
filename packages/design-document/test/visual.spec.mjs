import test from 'node:test';
import assert from 'node:assert/strict';
import { MASK_REGISTRY, assessImageResolution, imageRenderBounds, readPrivateImageDimensions, renderResolvedLayoutSvg, renderVisualImageSvg, resolveDesignLayout, validateDesignDocumentV2 } from '../src/index.mjs';
import { visualFixture, VISUAL_CASES } from './fixtures/visual-v2.mjs';
import { syntheticPng } from './fixtures/synthetic-png.mjs';
import { inflateSync } from 'node:zlib';
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const assets = { '550e8400-e29b-41d4-a716-446655440000': png, '550e8400-e29b-41d4-a716-446655440001': png };
const snapshot = { guest: { name: 'Invitation de test anonymisée' }, ceremonies: [] };

for (const id of VISUAL_CASES) test(`visual fixture ${id}: stable render tree and identical SVG content for Web/PDF`, () => {
  const document = visualFixture(id);
  validateDesignDocumentV2(document);
  const layout = resolveDesignLayout(document, snapshot, undefined, assets);
  assert.deepEqual(layout.errors, []);
  assert.deepEqual(layout, resolveDesignLayout(document, snapshot, undefined, assets));
  const web = renderResolvedLayoutSvg(layout, { assets, fragment: true });
  const pdf = renderResolvedLayoutSvg(layout, { assets });
  assert.equal(pdf.slice(pdf.indexOf('>') + 1, -6), web);
  assert.ok(web.includes(png));
  assert.deepEqual(layout.elements.map((layer) => layer.zIndex), layout.elements.map((layer) => layer.zIndex).sort((a, b) => a - b));
});

test('closed versioned masks cannot carry SVG, URLs, executable or unknown identifiers', () => {
  for (const maskId of Object.keys(MASK_REGISTRY)) {
    const doc = visualFixture('B'); doc.elements[1].maskId = maskId;
    assert.equal(MASK_REGISTRY[maskId].version, 1);
    assert.ok(renderResolvedLayoutSvg(resolveDesignLayout(doc, snapshot, undefined, assets)).includes('<image'));
  }
  for (const maskId of ['unknown', '<svg onload="alert(1)">', 'https://example.org/mask', '__proto__']) {
    const doc = visualFixture('B'); doc.elements[1].maskId = maskId;
    assert.throws(() => validateDesignDocumentV2(doc), /registered/);
  }
});

test('focal crop keeps subject centered when possible and clamps at frame edges', () => {
  const layer = { x: 20, y: 30, width: 200, height: 200, sourceWidth: 800, sourceHeight: 400, fit: 'cover', focalPoint: { x: 0.75, y: 0.5 } };
  assert.deepEqual(imageRenderBounds(layer), { x: -180, y: 30, width: 400, height: 200 });
  assert.equal(imageRenderBounds({ ...layer, focalPoint: { x: 0, y: 0 } }).x, 20);
  const doc = visualFixture('B');
  for (const focalPoint of [{ x: -0.01, y: 0 }, { x: 1.01, y: 0.5 }, { x: 0.5 }, { x: 0.5, y: 0.5, script: 'x' }]) {
    doc.elements[1].focalPoint = focalPoint; assert.throws(() => validateDesignDocumentV2(doc), /focal/);
  }
});

test('gradient/blur controls reject arbitrary markup and blend modes', () => {
  const doc = visualFixture('H');
  doc.elements[3].overlay.stops[0].color = 'url(javascript:alert(1))';
  assert.throws(() => validateDesignDocumentV2(doc), /hexadecimal/);
  const other = visualFixture('B'); other.elements[1].blur = 25;
  assert.throws(() => validateDesignDocumentV2(other), /blur/);
  other.elements[1].blur = 2; other.elements[1].overlay = { type: 'solid', opacity: 0.2, color: '#000000', blend: 'screen' };
  assert.throws(() => validateDesignDocumentV2(other), /overlay/);
});

test('private alpha sources retain bytes; missing or external assets are rejected', () => {
  const layer = visualFixture('G').elements[1];
  assert.ok(renderVisualImageSvg(layer, png).includes(png));
  assert.throws(() => renderVisualImageSvg(layer, 'https://example.org/image.png'), /private/);
  const layout = resolveDesignLayout(visualFixture('G'), snapshot, undefined, {});
  assert.ok(layout.errors.some((issue) => issue.code === 'ASSET_UNAVAILABLE'));
});

test('synthetic transparency fixture is a real decoded RGBA PNG with clear and opaque pixels', () => {
  const bytes = syntheticPng(32, 32, true);
  assert.deepEqual(readPrivateImageDimensions(bytes, 'image/png'), { width: 32, height: 32 });
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes[25], 6);
  const compressed = []; let position = 8;
  while (position < bytes.length) { const size = bytes.readUInt32BE(position); if (bytes.toString('ascii', position + 4, position + 8) === 'IDAT') compressed.push(bytes.subarray(position + 8, position + 8 + size)); position += size + 12; }
  const decoded = inflateSync(Buffer.concat(compressed));
  assert.equal(decoded[4], 0);
  assert.equal(decoded[16 * 129 + 1 + 16 * 4 + 3], 255);
});

test('private image geometry rejects unrecognized, truncated and oversized headers', () => {
  assert.throws(() => readPrivateImageDimensions(new Uint8Array(10), 'image/png'), /validated/);
  const png = syntheticPng(32, 48);
  assert.throws(() => readPrivateImageDimensions(png, 'image/webp'), /validated/);
  png.writeUInt32BE(20000, 16);
  assert.throws(() => readPrivateImageDimensions(png, 'image/png'), /range/);
  const header = Buffer.alloc(30); header.write('RIFF'); header.writeUInt32LE(22, 4); header.write('WEBPVP8X', 8); header.writeUInt32LE(10, 16); header[24] = 127; header[27] = 63;
  assert.deepEqual(readPrivateImageDimensions(header, 'image/webp'), { width: 128, height: 64 });
  assert.throws(() => readPrivateImageDimensions(header.subarray(0, 29), 'image/webp'), /validated/);
});

test('printing density accounts for zoom and physical target, without blocking a Web target', () => {
  const doc = visualFixture('B'), image = { ...doc.elements[1], sourceWidth: 120, sourceHeight: 160 };
  assert.equal(assessImageResolution(image, doc.canvas).status, 'ERROR');
  assert.equal(assessImageResolution(image, doc.canvas, { mode: 'web' }).status, 'OK');
  const normal = assessImageResolution(doc.elements[1], doc.canvas);
  const zoomed = assessImageResolution({ ...doc.elements[1], cropScale: 2 }, doc.canvas);
  assert.ok(Math.abs(zoomed.effectiveDpi * 2 - normal.effectiveDpi) <= 1);
  doc.elements[1] = image;
  assert.ok(resolveDesignLayout(doc, snapshot).errors.some((issue) => issue.code === 'IMAGE_RESOLUTION_LOW'));
  assert.ok(!resolveDesignLayout(doc, snapshot, undefined, undefined, { mode: 'web' }).errors.some((issue) => issue.code === 'IMAGE_RESOLUTION_LOW'));
});

test('decoration and background bypass safe margins; critical text and QR do not', () => {
  const doc = visualFixture('I');
  assert.ok(!resolveDesignLayout(doc, snapshot).errors.some((issue) => issue.elementId === 'ornament'));
  doc.elements.at(-1).x = 0;
  assert.ok(resolveDesignLayout(doc, snapshot).errors.some((issue) => issue.code === 'OUTSIDE_SAFE_AREA'));
});
