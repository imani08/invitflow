import assert from 'node:assert/strict';
import test from 'node:test';
import { createProfessionalTemplate, fillInvitationDecor, assertProfessionalPersonalization, validateDesignDocumentV2 } from '../src/index.mjs';

const image = { assetId: '550e8400-e29b-41d4-a716-446655440000', width: 768, height: 1024 };
test('private decor preserves structured text and QR, passes validation and supports replacement', () => {
  const source = createProfessionalTemplate('typographic-luxury');
  const next = fillInvitationDecor(source, image);
  assert.doesNotThrow(() => validateDesignDocumentV2(next));
  assert.doesNotThrow(() => assertProfessionalPersonalization(source, next));
  assert.deepEqual(next.elements.filter(layer => layer.id !== 'ai-background'), source.elements);
  const replacement = fillInvitationDecor(next, { ...image, assetId: '550e8400-e29b-41d4-a716-446655440001' });
  assert.doesNotThrow(() => assertProfessionalPersonalization(next, replacement));
  assert.equal(replacement.elements.filter(layer => layer.id === 'ai-background').length, 1);
});
test('decor cannot unlock layout, cover text opaquely, reference an external URL or mutate QR', () => {
  const source = createProfessionalTemplate('typographic-luxury');
  for (const changes of [{ opacity: 1 }, { zIndex: 200 }, { editable: true }, { width: 200 }]) {
    const next = fillInvitationDecor(source, image); Object.assign(next.elements.find(layer => layer.id === 'ai-background'), changes);
    assert.throws(() => assertProfessionalPersonalization(source, next));
  }
  assert.throws(() => fillInvitationDecor(source, { ...image, assetId: 'https://example.com/image.png' }));
});
