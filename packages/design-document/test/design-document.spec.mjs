import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fitInvitationText, isAllowedBinding, normalizeDesignDocumentV2, resolveDesignLayout, scaleLogicalBounds, validateDesignDocumentV2 } from '../src/index.mjs';

const fixture = async (name) => JSON.parse(await readFile(resolve(import.meta.dirname, 'fixtures', name), 'utf8'));

test('v1 document normalizes in memory without mutating its persisted source', async () => {
  const legacy = await fixture('legacy-v1.json');
  const before = structuredClone(legacy);
  const normalized = normalizeDesignDocumentV2(legacy);
  assert.equal(normalized.schemaVersion, 2);
  assert.deepEqual(legacy, before);
  assert.equal(normalized.elements.find((element) => element.id === 'guest').binding, 'guest.name');
  assert.equal(normalized.layoutVariants.some((variant) => variant.id === 'noCeremony'), true);
});

test('v2 schema accepts a valid fixture and rejects unsupported bindings and fields', async () => {
  const document = await fixture('portrait-two-ceremonies-v2.json');
  assert.equal(validateDesignDocumentV2(document), document);
  assert.equal(isAllowedBinding('guest.name'), true);
  assert.equal(isAllowedBinding('guest.password'), false);
  assert.throws(() => validateDesignDocumentV2({ ...document, debug: true }), /unsupported field/);
  assert.throws(() => validateDesignDocumentV2({ ...document, elements: document.elements.map((entry) => entry.id === 'guest' ? { ...entry, binding: 'guest.password' } : entry) }), /Binding is not allowed/);
  assert.throws(() => validateDesignDocumentV2({ ...document, layoutVariants: document.layoutVariants.filter((variant) => variant.id !== 'noCeremony') }), /ceremony layout variants/);
  assert.throws(() => validateDesignDocumentV2({ ...document, safeArea: { top: 'wide', right: 64, bottom: 64, left: 64 } }), /safeArea/);
});

test('layout variant selection handles zero through four ceremonies explicitly', async () => {
  const document = await fixture('portrait-two-ceremonies-v2.json');
  for (const [count, variant] of [[0, 'noCeremony'], [1, 'singleCeremony'], [2, 'twoCeremonies'], [3, 'threeCeremonies'], [4, 'multiCeremony']]) {
    const result = resolveDesignLayout(document, { guest: { name: 'Ada' }, ceremonies: Array.from({ length: count }, (_, index) => ({ name: `Ceremony ${index + 1}` })) });
    assert.equal(result.variantId, variant);
  }
});

test('missing optional table and QR values hide their bound layers', async () => {
  const document = await fixture('portrait-two-ceremonies-v2.json');
  const result = resolveDesignLayout(document, { guest: { name: 'Ada' }, qr: { available: false }, ceremonies: [{ name: 'Civil' }, { name: 'Reception' }] });
  assert.equal(result.elements.some((element) => element.sourceElementId === 'table'), false);
  assert.equal(result.elements.some((element) => element.sourceElementId === 'qr'), false);
});

test('a legacy RSVP placeholder resolves to the authorized invitation URL only when available', async () => {
  const legacy = await fixture('legacy-v1.json');
  legacy.elements.push({ id: 'legacy-rsvp', type: 'TEXT', text: '{{rsvp_link}}', x: 100, y: 500, width: 880, height: 80, fontSize: 24, role: 'BODY' });
  const hidden = resolveDesignLayout(legacy, { qr: { available: false, url: 'https://events.example/invite/private-token' } });
  assert.equal(hidden.elements.some((element) => element.id === 'legacy-rsvp'), false);
  const visible = resolveDesignLayout(legacy, { qr: { available: true, url: 'https://events.example/invite/opaque-token' } });
  assert.equal(visible.elements.find((element) => element.id === 'legacy-rsvp').resolvedText, 'https://events.example/invite/opaque-token');
});

test('long guest names shrink only to the configured floor, otherwise report overflow', async () => {
  const document = await fixture('portrait-two-ceremonies-v2.json');
  const result = resolveDesignLayout(document, { guest: { name: 'Alexandra Marie-Jeanne de la Très Longue Famille' }, ceremonies: [{ name: 'Civil' }, { name: 'Reception' }] });
  const guest = result.elements.find((element) => element.id === 'guest');
  assert.ok(guest.resolvedFontSize <= guest.preferredFontSize);
  assert.ok(guest.resolvedFontSize >= guest.minFontSize);
  assert.ok(!result.errors.some((issue) => issue.elementId === 'guest' && issue.code === 'TEXT_OVERFLOW'));
  assert.equal(fitInvitationText({ width: 50, height: 10, preferredFontSize: 30, minFontSize: 8, maxLines: 1, overflowPolicy: 'ERROR' }, 'A very long name that cannot fit').overflow, true);
});

test('safe-area violations are errors only for essential text and z-order remains stable', async () => {
  const document = await fixture('portrait-two-ceremonies-v2.json');
  const moved = { ...document, elements: document.elements.map((element) => element.id === 'guest' ? { ...element, y: 8 } : element) };
  const result = resolveDesignLayout(moved, { guest: { name: 'Alex' }, ceremonies: [{ name: 'Civil' }, { name: 'Reception' }] });
  assert.ok(result.errors.some((issue) => issue.code === 'OUTSIDE_SAFE_AREA' && issue.elementId === 'guest'));
  const background = result.elements[0];
  assert.equal(background.id, 'background');
  assert.deepEqual(result, resolveDesignLayout(moved, { guest: { name: 'Alex' }, ceremonies: [{ name: 'Civil' }, { name: 'Reception' }] }));
});

test('repeat groups create correctly bounded ceremony entries for the requested count', async () => {
  const document = await fixture('portrait-two-ceremonies-v2.json');
  const result = resolveDesignLayout(document, { ceremonies: [{ name: 'Civil' }, { name: 'Religious' }, { name: 'Reception' }] });
  assert.equal(result.groups[0].items.length, 3);
  assert.deepEqual(result.elements.filter((element) => element.sourceElementId === 'ceremony-name').map((element) => element.resolvedText), ['Civil', 'Religious', 'Reception']);
  assert.ok(result.elements.filter((element) => element.sourceElementId === 'ceremony-name').every((element) => element.x >= 0 && element.x + element.width <= document.canvas.width));
});

test('render data for one guest cannot leak into another guest resolution', async () => {
  const document = await fixture('portrait-two-ceremonies-v2.json');
  const a = resolveDesignLayout(document, { guest: { name: 'Guest A' }, ceremonies: [{ name: 'Civil' }, { name: 'Reception' }] });
  const b = resolveDesignLayout(document, { guest: { name: 'Guest B' }, ceremonies: [{ name: 'Civil' }, { name: 'Reception' }] });
  assert.equal(a.elements.find((element) => element.id === 'guest').resolvedText, 'Guest A');
  assert.equal(b.elements.find((element) => element.id === 'guest').resolvedText, 'Guest B');
  assert.equal(JSON.stringify(b).includes('Guest A'), false);
});

test('legacy ceremony placeholders still receive the ordered ceremony names', async () => {
  const legacy = await fixture('legacy-v1.json');
  legacy.elements.push({ id: 'legacy-ceremonies', type: 'TEXT', text: '{{ceremony_name}}', x: 120, y: 700, width: 840, height: 100, fontSize: 32, role: 'BODY' });
  const result = resolveDesignLayout(legacy, { ceremonies: [{ name: 'Civil' }, { name: 'Reception' }] });
  assert.equal(result.elements.find((element) => element.id === 'legacy-ceremonies').resolvedText, 'Civil · Reception');
});

test('logical bounds scale uniformly from the canvas coordinates', () => {
  assert.deepEqual(scaleLogicalBounds({ x: 10, y: 20, width: 100, height: 40 }, { width: 1000, height: 2000 }, { width: 500, height: 1000 }), { x: 5, y: 10, width: 50, height: 20 });
});
