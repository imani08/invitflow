import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDesignDocument, validateDesignDocument } from './design-document.js';
import { createProfessionalTemplate, PROFESSIONAL_RECIPES } from '@invitaflow/design-document';
test('professional catalogue compositions survive the existing backend validator', () => {
  for (const { id } of PROFESSIONAL_RECIPES) {
    const document = createProfessionalTemplate(id);
    assert.equal(validateDesignDocument(normalizeDesignDocument(document)).schemaVersion, 2);
  }
});

test('v2 visual effects and private transparent assets survive validation and normalization', () => {
  const doc = normalizeDesignDocument({});
  doc.assets.push({ id: 'cutout', role: 'COUPLE_PHOTO', assetId: '550e8400-e29b-41d4-a716-446655440000', mimeType: 'image/png' });
  doc.elements.push({ id: 'foreground', name: 'Photo de test', type: 'IMAGE', role: 'FOREGROUND', x: 100, y: 400, width: 500, height: 600, zIndex: 50, rotation: 12, locked: false, editable: true, assetId: '550e8400-e29b-41d4-a716-446655440000', sourceWidth: 2400, sourceHeight: 3200, fit: 'cover', cropX: 50, cropY: 50, cropScale: 1.2, opacity: 0.9, focalPoint: { x: 0.4, y: 0.3 }, maskId: 'watercolor-soft-01', blur: 2, overlay: { type: 'solid', color: '#32163A', opacity: 0.15 } });
  const before = structuredClone(doc);
  const result = normalizeDesignDocument(validateDesignDocument(doc));
  assert.deepEqual(doc, before);
  assert.deepEqual(result.elements.at(-1), before.elements.at(-1));
  assert.equal((result.assets[0] as Record<string, unknown>)['mimeType'], 'image/png');
  const bad = structuredClone(result); bad.elements.at(-1)!['maskId'] = '<svg onload="alert(1)">';
  assert.throws(() => validateDesignDocument(bad), /registered/);
});

test('normalizes an incomplete legacy document into a valid editor and render document', () => {
  const normalized = normalizeDesignDocument({ canvas: { width: 1080, height: 1920 }, theme: {} });
  const validated = validateDesignDocument(normalized);
  assert.equal((validated.theme['tokens'] as Record<string, unknown>)['background'], '#F5F0E8');
  assert.ok(validated.elements.some((element) => element['text'] === '{{guest_name}}'));
  assert.ok(validated.elements.some((element) => element['text'] === '{{table_name}}'));
  assert.ok(validated.elements.some((element) => element['type'] === 'QR' && element['source'] === 'guest_access_token'));
  assert.ok(validated.variables.some((variable) => variable['key'] === 'guest_name'));
  assert.ok(validated.variables.some((variable) => variable['key'] === 'table_name'));
});

test('preserves usable legacy text and normalizes its missing presentation fields', () => {
  const normalized = normalizeDesignDocument({
    canvas: { width: 900, height: 1600 },
    theme: { tokens: { background: '#FFFFFF', primary: '#32163A' } },
    elements: [{ id: 'old-title', type: 'TEXT', text: 'Invitation', x: 100, y: 200, width: 700, height: 120 }],
  });
  const validated = validateDesignDocument(normalized);
  assert.equal(validated.elements.find((element) => element['id'] === 'old-title')?.['text'], 'Invitation');
  assert.equal((validated.theme['tokens'] as Record<string, unknown>)['font'], 'Georgia');
  assert.equal(validated.canvas.unit, 'px');
});

test('keeps the normalized document inside the current layer limit and deduplicates old IDs', () => {
  const normalized = normalizeDesignDocument({
    elements: Array.from({ length: 97 }, (_, index) => ({
      id: index === 1 ? 'legacy-0' : `legacy-${index}`,
      type: 'TEXT',
      text: 'Détail décoratif',
      x: 0,
      y: index,
      width: 200,
      height: 20,
    })),
  });
  const validated = validateDesignDocument(normalized);
  assert.equal(validated.elements.length, 100);
  assert.equal(new Set(validated.elements.map((element) => element['id'])).size, 100);
  assert.ok(validated.elements.some((element) => element['text'] === '{{guest_name}}'));
  assert.ok(validated.elements.some((element) => element['text'] === '{{table_name}}'));
  assert.ok(validated.elements.some((element) => element['type'] === 'QR'));
});

test('preserves a private WebP image layer crop and asset reference without embedding bytes', () => {
  const normalized = normalizeDesignDocument({
    assets: [{ id: 'photo', role: 'COUPLE_PHOTO', assetId: '550e8400-e29b-41d4-a716-446655440000', mimeType: 'image/webp' }],
    elements: [{
      id: 'couple-photo', type: 'IMAGE', name: 'Photo des mariés', assetId: '550e8400-e29b-41d4-a716-446655440000',
      sourceWidth: 1200, sourceHeight: 800, fit: 'cover', cropX: 40, cropY: 60, cropScale: 1.4, opacity: 0.9,
      x: 40, y: 80, width: 600, height: 400, rotation: 0,
    }],
  });
  const validated = validateDesignDocument(normalized);
  const image = validated.elements.find((element) => element['type'] === 'IMAGE');
  assert.equal(image?.['assetId'], '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(image?.['cropScale'], 1.4);
  assert.equal((validated.assets[0] as Record<string, unknown> | undefined)?.['mimeType'], 'image/webp');
  assert.equal(JSON.stringify(validated).includes('base64'), false);
});
