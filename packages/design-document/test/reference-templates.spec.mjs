import assert from 'node:assert/strict';
import test from 'node:test';
import { REFERENCE_TEMPLATES, createReferenceTemplate, invitationDisplayFields, invitationPrintFormat, resolveDesignLayout, renderResolvedLayoutSvg, validateDesignDocumentV2, assertProfessionalPersonalization, fillProfessionalPhotoSlot } from '../src/index.mjs';

for (const reference of REFERENCE_TEMPLATES) {
  test(`${reference.id}: structured reference without flattened original or personal text`, () => {
    const document = createReferenceTemplate(reference.id);
    const serialized = JSON.stringify(document);
    assert.doesNotMatch(serialized, /Kizungu|Isanganino|Lyevin|Françoise|Mumbere|Filbert|data:image|https?:\/\//);
    assert.equal(document.metadata.origin, 'REFERENCE_RECONSTRUCTION');
    assert.equal(document.elements.find(layer => layer.id === 'guest').binding, 'guest.name');
    assert.equal(document.elements.find(layer => layer.id === 'invitation').binding, 'event.invitationText');
    assert.equal(document.elements.find(layer => layer.id === 'guest').fontId, 'great-vibes');
    assert.equal(document.canvas.width, 1500);
    assert.equal(document.canvas.height, reference.id.endsWith('gold') ? 1500 : 2121);
    assert.doesNotThrow(() => validateDesignDocumentV2(document));
    const invalid = structuredClone(document);
    invalid.elements.find(layer => layer.ornamentId).ornamentId = '<svg onload="alert(1)">';
    assert.throws(() => validateDesignDocumentV2(invalid));
  });

  test(`${reference.id}: zero to four real ceremonies and personalized dates`, () => {
    for (let count = 0; count <= 4; count++) {
      const document = createReferenceTemplate(reference.id);
      const display = invitationDisplayFields({ name: 'Union test', invitationText: 'Texte personnalisé uniquement.', timezone: 'Africa/Kinshasa', startAt: '2026-10-10T09:00:00Z', ceremonies: Array.from({ length: count }, (_, index) => ({ name: `Cérémonie ${index}`, startAt: '2026-10-10T09:00:00Z', venue: 'Lieu personnalisé' })) });
      assert.equal(display.event.day, '10');
      assert.equal(display.event.month, 'OCTOBRE');
      const layout = resolveDesignLayout(document, { ...display, guest: { name: 'Invité personnalisé' }, table: { name: 'Table test' }, qr: { available: false } }, undefined, {}, { mode: 'web' });
      assert.deepEqual(layout.errors, []);
      const svg = renderResolvedLayoutSvg(layout);
      assert.match(svg, /Texte personnalisé uniquement/);
      assert.doesNotMatch(svg, /Kizungu|Isanganino|Mumbere/);
    }
  });
}

test('square print format is explicit and legacy A5 cannot receive arbitrary dimensions', () => {
  assert.deepEqual(invitationPrintFormat(createReferenceTemplate('reference-02-gold')), { widthMm: 150, heightMm: 150 });
  assert.deepEqual(invitationPrintFormat(createReferenceTemplate('reference-01-ivory')), { widthMm: 148, heightMm: 210 });
  assert.deepEqual(invitationPrintFormat({ metadata: { format: { widthMm: 'evil' } } }), { widthMm: 148, heightMm: 210 });
});

test('reference contact and closing text are editable while QR geometry stays protected', () => {
  const source = createReferenceTemplate('reference-02-gold');
  const next = structuredClone(source);
  next.variables.find(variable => variable.key === 'referenceContact').defaultValue = '+243 000 000 000';
  next.variables.find(variable => variable.key === 'closingText').defaultValue = 'Votre texte personnel.';
  assert.doesNotThrow(() => assertProfessionalPersonalization(source, next));
  next.elements.find(layer => layer.id === 'qr').x = 0;
  assert.throws(() => assertProfessionalPersonalization(source, next));
});

test('all reference photo slots accept private Media metadata while preserving the template lock', () => {
  for (const reference of REFERENCE_TEMPLATES) {
    let document = createReferenceTemplate(reference.id);
    for (const slot of document.metadata.photoSlots) {
      const next = fillProfessionalPhotoSlot(document, slot.id, { assetId: '550e8400-e29b-41d4-a716-446655440000', width: 3000, height: 4000 });
      assert.doesNotThrow(() => assertProfessionalPersonalization(document, next));
      assert.equal(next.elements.find(layer => layer.id === slot.elementId).maskId, slot.maskId);
      document = next;
    }
  }
});
