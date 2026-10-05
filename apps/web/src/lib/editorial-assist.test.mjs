import test from 'node:test';
import assert from 'node:assert/strict';
import { canApplyEditorial, editorialSelectionRequest } from './editorial-assist.mjs';

const job = { id: 'proposal', baseVersion: 2, status: 'PROPOSED', editorial: { fits: true, proposedText: 'Bienvenue.' } };
test('only a valid, current proposal can be explicitly selected', () => {
  assert.equal(canApplyEditorial(null, { dirty: false, currentVersion: 2 }), false);
  assert.equal(canApplyEditorial(job, { dirty: false, currentVersion: 2 }), true);
  assert.deepEqual(editorialSelectionRequest(job, { dirty: false, currentVersion: 2 }), { editorialJobId: 'proposal', expectedVersion: 2 });
  assert.throws(() => editorialSelectionRequest(job, { dirty: true, currentVersion: 2 }));
  assert.throws(() => editorialSelectionRequest(job, { dirty: false, currentVersion: 3 }));
  for (const status of ['QUEUED', 'PROCESSING', 'FAILED', 'STALE', 'EXPIRED', 'CANCELLED']) assert.equal(canApplyEditorial({ ...job, status }, { dirty: false, currentVersion: 2 }), false);
  assert.equal(canApplyEditorial({ ...job, editorial: { ...job.editorial, fits: false } }, { dirty: false, currentVersion: 2 }), false);
});
test('manual selection is explicit and cancellation or empty content cannot apply a proposal', () => {
  assert.deepEqual(editorialSelectionRequest(null, { dirty: false, currentVersion: 2, manualText: 'Texte choisi.', elementId: 'invitation', sourceText: 'Original.' }), { editorialText: 'Texte choisi.', elementId: 'invitation', sourceText: 'Original.', expectedVersion: 2 });
  assert.throws(() => editorialSelectionRequest(null, { dirty: false, currentVersion: 2 }));
  assert.throws(() => editorialSelectionRequest(null, { dirty: false, currentVersion: 2, manualText: '' }));
});
