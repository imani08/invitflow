import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROFESSIONAL_TEMPLATE_IDS, PROFESSIONAL_RECIPES, compatibleProfessionalRecipes, createProfessionalTemplate, fillProfessionalPhotoSlot, assertProfessionalPersonalization, resolveDesignLayout } from '../src/index.mjs';

/** DEMO only: synthetic catalogue/test data, never used to initialize an event. */
export const demo = (count, options = {}) => ({
  guest: { name: options.longName ? 'Madame la Professeure Éliane et Monsieur Alexandre de la Maison des Horizons' : 'Camille' },
  table: options.table ? { name: 'Table • Jardin' } : null,
  event: { title: 'DEMO — Invitation', coupleNames: 'Alex & Camille', date: '12 septembre 2030', invitationText: options.longText ? 'Nous vous invitons à partager cette journée avec nous. Que nos retrouvailles soient une célébration de nos liens et des souvenirs qui nous rassemblent. Nous serons heureux de vous accueillir pour ces moments précieux, entourés de celles et ceux qui nous accompagnent depuis toujours.' : 'Nous serons heureux de partager cette journée avec vous.' },
  contact: options.contact ? { value: 'Contact DEMO' } : null,
  ceremonies: Array.from({ length: count }, (_, index) => ({ name: ['Civil', 'Célébration', 'Réception', 'Soirée'][index] ?? 'Cérémonie', date: '12 septembre', time: '14:00', venue: 'Jardin des Horizons', address: '12 avenue des Jardins', reference: 'Entrée principale', dressCode: options.dressCode ? 'Élégance naturelle' : '' })),
});
const asset = { assetId: '550e8400-e29b-41d4-a716-446655440000', width: 3600, height: 4800 };

for (const id of PROFESSIONAL_TEMPLATE_IDS) {
  test(`${id}: ceremony and content matrix`, () => {
    for (let count = 0; count <= 4; count++) for (let flags = 0; flags < 32; flags++) for (const landscape of [false, true]) {
      const document = createProfessionalTemplate(id, { mainPhoto: { ...asset, width: landscape ? 4800 : 3600, height: landscape ? 3600 : 4800 } });
      const snapshot = demo(count, { longName: !!(flags & 1), longText: !!(flags & 2), table: !!(flags & 4), dressCode: !!(flags & 8), contact: !!(flags & 16) });
      const layout = resolveDesignLayout(document, snapshot);
      assert.deepEqual(layout.errors, [], `${count} ceremonies, flags=${flags}, landscape=${landscape}`);
      assert.equal(layout.groups[0].items.length, count);
      if (count === 4) {
        const [first, second, third] = layout.groups[0].items.map((item) => item.bounds);
        assert.equal(second.x - first.x - first.width, 35);
        assert.equal(third.y - first.y - first.height, 35);
      }
      assert.equal(layout.elements.some((entry) => entry.id === 'table'), !!(flags & 4));
      assert.equal(layout.elements.some((entry) => entry.id === 'contact'), !!(flags & 16));
      assert.equal(layout.elements.some((entry) => entry.id === 'qr'), false);
      assert.ok(layout.elements.filter((entry) => entry.type === 'TEXT').every((entry) => entry.resolvedFontSize >= entry.minFontSize));
    }
  });
}
test('excessive text stays diagnostic', () => {
  const snapshot = demo(4); snapshot.event.invitationText = 'Un texte éditorial excessivement long. '.repeat(150);
  assert.ok(resolveDesignLayout(createProfessionalTemplate(PROFESSIONAL_TEMPLATE_IDS[0]), snapshot).errors.some((entry) => entry.code === 'TEXT_OVERFLOW_ASSISTANCE_AVAILABLE'));
});
test('single person, couple, family and title identities and medium copy retain hierarchy', () => {
  for (const id of PROFESSIONAL_TEMPLATE_IDS) for (const name of ['Camille', 'Camille & Alex', 'Famille des Horizons et ses enfants', 'Madame la Professeure Éliane des Horizons']) {
    const snapshot = demo(4); snapshot.guest.name = name;
    snapshot.event.invitationText = 'Nous vous invitons à une journée de partage. Venez célébrer avec nous les liens qui nous rassemblent et les souvenirs que nous construirons ensemble.';
    const layout = resolveDesignLayout(createProfessionalTemplate(id, { mainPhoto: asset }), snapshot);
    assert.deepEqual(layout.errors, []);
    assert.ok(layout.elements.find((element) => element.id === 'guest').resolvedFontSize > layout.elements.find((element) => element.id === 'invitation').resolvedFontSize);
  }
});
test('required photograph blocks printing while the empty catalogue composition remains previewable', () => {
  const document = createProfessionalTemplate('botanical-elegance');
  assert.ok(resolveDesignLayout(document, demo(1)).errors.some((entry) => entry.code === 'PHOTO_SLOT_REQUIRED'));
  assert.deepEqual(resolveDesignLayout(document, demo(1), undefined, undefined, { mode: 'web' }).errors, []);
});
test('photo slot accepts real metadata, blocks arbitrary structural edits and policy removal', () => {
  const document = createProfessionalTemplate('photo-editorial-luxury');
  const filled = fillProfessionalPhotoSlot(document, 'mainPhoto', asset);
  assert.doesNotThrow(() => assertProfessionalPersonalization(document, filled));
  const cropped = structuredClone(filled); cropped.elements.find((entry) => entry.id === 'main-photo').cropScale = 1.5;
  assert.doesNotThrow(() => assertProfessionalPersonalization(filled, cropped));
  const reorder = (value) => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => b.localeCompare(a)).map(([key, item]) => [key, reorder(item)])) : value;
  assert.doesNotThrow(() => assertProfessionalPersonalization(reorder(filled), cropped));
  const background = fillProfessionalPhotoSlot(filled, 'backgroundPhoto', asset);
  const secondary = fillProfessionalPhotoSlot(background, 'secondaryPhoto', asset);
  assert.doesNotThrow(() => assertProfessionalPersonalization(filled, background));
  assert.doesNotThrow(() => assertProfessionalPersonalization(background, secondary));
  for (const change of [candidate => { candidate.metadata = {}; }, candidate => { candidate.elements[0].width -= 1; }, candidate => { candidate.elements.find((entry) => entry.id === 'main-photo').x += 10; }, candidate => { candidate.groups = []; }, candidate => { candidate.elements.pop(); }]) {
    const candidate = structuredClone(filled); change(candidate);
    assert.throws(() => assertProfessionalPersonalization(filled, candidate));
  }
  assert.throws(() => fillProfessionalPhotoSlot(document, 'other', asset));
  assert.throws(() => fillProfessionalPhotoSlot(document, 'mainPhoto', { width: 100, height: 100 }));
});

test('no-photo recipes recompose each family and resolve table, QR and ceremony states', () => {
  for (const recipe of PROFESSIONAL_RECIPES.filter(entry => entry.mediaStrategy === 'NO_PHOTO')) {
    const document = createProfessionalTemplate(recipe.id);
    assert.equal(document.metadata.photoRequired, false);
    assert.deepEqual(document.metadata.photoSlots, []);
    assert.ok(!document.elements.some(entry => entry.id === 'main-photo'));
    assert.ok(document.elements.find(entry => entry.id === 'couple').fontSize >= 82);
    assert.throws(() => fillProfessionalPhotoSlot(document, 'mainPhoto', asset));
    for (const count of [0, 1, 2, 3, 4]) for (const table of [false, true]) for (const qr of [false, true]) {
      const snapshot = demo(count, { table, longName: true, longText: true });
      snapshot.qr = qr ? { available: true, value: 'https://example.test/invitation/test' } : { available: false };
      const layout = resolveDesignLayout(document, snapshot);
      assert.deepEqual(layout.errors, [], recipe.id + ':' + count);
      assert.equal(layout.elements.some(entry => entry.id === 'table'), table);
      assert.equal(layout.elements.some(entry => entry.id === 'qr'), qr);
      assert.equal(layout.groups[0].items.length, count);
      assert.ok(layout.groups[0].items.every(item => item.bounds.y + item.bounds.height <= 1825));
    }
    for (const key of ['family', 'layoutRecipe', 'mediaStrategy', 'photoComposition', 'ceremonyLayout', 'guestHeaderLayout', 'tableLayout', 'palette', 'fontSet', 'maskSet', 'decorationSet']) assert.ok(key in document.metadata);
  }
});
test('real media availability selects compatible recipes without a closed catalogue size', () => {
  assert.ok(compatibleProfessionalRecipes({ hasPhotos: false, photoCount: 0 }).every(recipe => !recipe.photoRequired));
  assert.ok(compatibleProfessionalRecipes({ hasPhotos: true, photoCount: 1, photoOrientation: 'PORTRAIT' }).some(recipe => recipe.photoRequired));
  assert.ok(compatibleProfessionalRecipes({ hasPhotos: true, photoCount: 1, photoOrientation: 'LANDSCAPE' }).some(recipe => !recipe.photoRequired));
  assert.ok(compatibleProfessionalRecipes({ hasPhotos: true, photoCount: 0 }).every(recipe => !recipe.photoRequired));
  const editorial = createProfessionalTemplate('photo-editorial-luxury');
  assert.ok(resolveDesignLayout(editorial, demo(1)).errors.some(error => error.code === 'PHOTO_SLOT_REQUIRED'));
  assert.deepEqual(resolveDesignLayout(fillProfessionalPhotoSlot(editorial, 'mainPhoto', asset), demo(1)).errors, []);
});
