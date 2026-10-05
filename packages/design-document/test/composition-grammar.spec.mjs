import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFESSIONAL_RECIPES, createProfessionalTemplate, validateProfessionalComposition, professionalCompositionManifest, professionalCompositionFingerprint } from '../src/index.mjs';

test('all registered recipes have a deterministic composition and reproducibility envelope', () => {
  const fingerprints = new Set();
  for (const recipe of PROFESSIONAL_RECIPES) {
    const document = createProfessionalTemplate(recipe.id);
    const before = structuredClone(document);
    const manifest = professionalCompositionManifest(document, 'seed-example');
    assert.deepEqual(document, before);
    assert.deepEqual(professionalCompositionManifest(document, 'seed-example'), manifest);
    assert.equal(manifest.seed, 'seed-example');
    assert.equal(manifest.designVersion, document.version);
    fingerprints.add(manifest.fingerprint);
    const reordered = Object.fromEntries(Object.entries(manifest.composition).reverse());
    reordered.fontSet.reverse();
    assert.equal(professionalCompositionFingerprint(reordered), manifest.fingerprint);
    assert.equal(professionalCompositionManifest(document, 'different-seed').fingerprint, manifest.fingerprint);
  }
  assert.equal(fingerprints.size, PROFESSIONAL_RECIPES.length);
});

test('grammar rejects arbitrary coordinates and unregistered or incompatible dimensions', () => {
  const document = createProfessionalTemplate('botanical-illustration');
  const { composition } = professionalCompositionManifest(document, 'seed');
  for (const change of [
    value => { value.x = 42; },
    value => { value.family = 'photo-editorial-luxury'; },
    value => { value.photoComposition = 'ARBITRARY'; },
    value => { value.maskSet = ['unknown']; },
    value => { value.palette[0] = '#000000'; },
    value => { value.layoutRecipe = 'unknown'; },
    value => { delete value.backgroundTreatment; },
  ]) {
    const candidate = structuredClone(composition); change(candidate);
    assert.throws(() => validateProfessionalComposition(candidate));
  }
  for (const seed of ['', ' ', 'x'.repeat(129), undefined]) assert.throws(() => professionalCompositionManifest(document, seed));
  const invalid = structuredClone(document); invalid.elements[0].type = 'SCRIPT';
  assert.throws(() => professionalCompositionManifest(invalid, 'seed'));
});
