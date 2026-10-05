import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_COMPOSER_VERSION, PROFESSIONAL_RECIPES, composeDesignProposals, professionalCompositionManifest } from '../src/index.mjs';

const uuid = index => `550e8400-e29b-41d4-a716-${String(446655440000 + index).padStart(12, '0')}`;
const photos = (count, width = 3600, height = 4800) => Array.from({ length: count }, (_, index) => ({ id: uuid(index), purpose: 'PHOTO', status: 'READY', width, height }));
const ceremony = index => ({ name: `Cérémonie ${index + 1}`, date: '12 octobre 2030', time: '14:30', venue: 'Jardin des Fleurs', dressCode: 'Tenue élégante' });
const compose = overrides => composeDesignProposals({ eventType: 'WEDDING', ceremonies: [ceremony(0)], textDensity: 'MEDIUM', photos: photos(4), seed: 'reproducible-seed', preferences: { count: 4 }, ...overrides });

test('composer covers one/four ceremonies, photo/no-photo, wedding and Dot with valid v2 previews', () => {
  for (const result of [
    compose({ ceremonies: [ceremony(0)] }),
    compose({ ceremonies: Array.from({ length: 4 }, (_, index) => ceremony(index)) }),
    compose({ photos: [] }),
    compose({ eventType: 'DOT', photos: [] }),
  ]) {
    assert.equal(result.items.length, 4);
    for (const item of result.items) {
      assert.equal(item.document.schemaVersion, 2);
      assert.deepEqual(item.document.layoutVariants.map(variant => variant.id).sort(), ['multiCeremony', 'noCeremony', 'singleCeremony', 'threeCeremonies', 'twoCeremonies']);
      assert.equal(item.document.metadata.composer.composerVersion, AI_COMPOSER_VERSION);
      assert.equal(professionalCompositionManifest(item.document, result.seed).fingerprint, item.fingerprint);
    }
  }
  assert.ok(compose({ photos: [] }).items.every(item => item.document.metadata.mediaStrategy === 'NO_PHOTO'));
  assert.ok(compose({ eventType: 'DOT' }).items.some(item => item.document.metadata.mediaStrategy !== 'NO_PHOTO'));
  assert.ok(compose({ eventType: 'BIRTHDAY' }).items.every(item => item.document.metadata.mediaStrategy === 'NO_PHOTO' && item.document.theme.category === 'BIRTHDAY'));
});

test('media strategies, actual orientations, structural filters and resolver rejection are enforced', () => {
  const landscape = compose({ photos: photos(2, 4800, 3200) });
  const portrait = compose({ photos: photos(2, 3200, 4800), seed: 'portrait-0', preferences: { count: 4, media: 'WITH_PHOTO' } });
  assert.ok(landscape.items.some(item => item.document.metadata.mediaStrategy === 'SINGLE_PHOTO'));
  assert.ok(portrait.items.some(item => item.document.metadata.mediaStrategy === 'MULTI_PHOTO'));
  assert.ok(portrait.items.every(item => item.document.metadata.photoSlots.every(slot => !slot.required || item.document.elements.some(layer => layer.id === slot.elementId && layer.type === 'IMAGE'))));
  assert.ok(compose({ photos: photos(1), preferences: { count: 4, media: 'WITH_PHOTO' } }).items.every(item => item.document.metadata.mediaStrategy !== 'NO_PHOTO'));
  assert.ok(compose({ photos: photos(1), preferences: { count: 4, media: 'WITHOUT_PHOTO' } }).items.every(item => item.document.metadata.mediaStrategy === 'NO_PHOTO'));
  assert.ok(compose({ hasQr: false }).items.length >= 3);
  assert.ok(compose({ hasQr: true, hasTable: true, hasDressCode: true }).items.length >= 3);
  assert.ok(compose({ textDensity: 'HIGH', ceremonies: Array.from({ length: 4 }, (_, index) => ceremony(index)), invitationText: 'Texte dense '.repeat(20) }).items.length >= 3);
  assert.equal(compose({ textDensity: 'HIGH', invitationText: 'Texte dense '.repeat(100) }).items.length, 0);
  assert.ok(PROFESSIONAL_RECIPES.filter(recipe => !recipe.supportedEventTypes.includes('BIRTHDAY')).every(recipe => !compose({ eventType: 'BIRTHDAY' }).eligibleRecipes.includes(recipe.id)));
});

test('client-selected private photo ids constrain candidates and remain reproducible in the selected document', () => {
  const selectedId = uuid(2);
  const result = compose({ preferences: { count: 4, media: 'WITH_PHOTO', photoIds: [selectedId] } });
  assert.ok(result.items.some(item => item.document.metadata.mediaStrategy !== 'NO_PHOTO'));
  for (const item of result.items) {
    assert.deepEqual(item.document.metadata.composer.interpretedPreferences.photoIds, [selectedId]);
    assert.ok(item.document.metadata.composer.photoAssetIds.every(id => id === selectedId));
  }
  assert.equal(compose({ preferences: { count: 4, media: 'WITH_PHOTO', photoIds: [uuid(99)] } }).items.length, 0);
});

test('scoring is explainable and seeded proposals vary with repeat avoidance and family diversity', () => {
  const first = compose({ preferences: { count: 4, style: 'minimal', colors: ['gold'] } });
  const same = compose({ preferences: { count: 4, style: 'minimal', colors: ['gold'] } });
  const different = compose({ seed: 'another-seed', preferences: { count: 4, style: 'minimal', colors: ['gold'] } });
  assert.deepEqual(first.items, same.items);
  assert.notDeepEqual(first.items.map(item => item.fingerprint), different.items.map(item => item.fingerprint));
  assert.ok(first.items.every(item => ['compatibilityScore', 'styleScore', 'mediaScore', 'ceremonyScore', 'diversityScore', 'finalScore'].every(key => Number.isFinite(item.score[key]))));
  assert.ok(new Set(first.items.map(item => item.document.metadata.family)).size >= 3);
  assert.equal(compose({ preferences: { count: 6, colors: ['dark'] }, seed: 'midnight-seed' }).items.length, 6);
  assert.ok(compose({ preferences: { count: 4, colors: ['dark'] }, seed: 'dark-seed' }).items.some(item => item.document.metadata.paletteId === 'midnight'));
  assert.throws(() => compose({ preferences: { count: 100 } }));
  const next = compose({ seed: 'next-seed', previouslyShown: first.items.map(item => item.fingerprint), preferences: { count: 4 } });
  assert.ok(next.items.length >= 3);
  assert.ok(next.items.every(item => !first.items.some(prior => prior.fingerprint === item.fingerprint)));
});

test('provider unavailability cannot stop local composition and no guest data enters the composer input', () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('provider unavailable'); };
  try {
    const result = compose({ ceremonies: Array.from({ length: 4 }, (_, index) => ceremony(index)) });
    assert.equal(result.items.length, 4);
    assert.equal(calls, 0);
    assert.ok(!JSON.stringify(result).includes('invitee@'));
    assert.ok(result.items.every(item => item.document.metadata.composer.seed === 'reproducible-seed'));
  } finally { globalThis.fetch = originalFetch; }
});
