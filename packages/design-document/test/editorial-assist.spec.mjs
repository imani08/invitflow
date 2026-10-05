import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfessionalTemplate, editorialField, editorialTarget, protectedEditorialTerms, redactEditorial, restoreEditorial, validateEditorialProposal, applyEditorialSelection, resolveDesignLayout, validateDesignDocumentV2 } from '../src/index.mjs';

const document = createProfessionalTemplate('typographic-luxury');
const layer = editorialField(document, 'invitation');
const long = 'Nous serons heureux de partager une journée chaleureuse avec vous. '.repeat(30);
test('short copy fits, long editorial copy offers assistance after deterministic fitting', () => {
  assert.equal(editorialTarget(layer, 'Bienvenue à notre célébration.').overflow, false);
  assert.equal(editorialTarget(layer, long).overflow, true);
  assert.throws(() => editorialField(document, 'guest'));
  assert.throws(() => editorialField({ ...document, metadata: {} }, 'invitation'));
});
test('LIGHT, BALANCED and CONCISE have measurable progressive targets', () => {
  const targets = ['LIGHT', 'BALANCED', 'CONCISE'].map(level => editorialTarget(layer, long, level));
  assert.ok(targets[0].maxCharacters > targets[1].maxCharacters);
  assert.ok(targets[1].maxCharacters > targets[2].maxCharacters);
  assert.ok(targets[2].maxCharacters <= targets[2].layoutCapacity);
  assert.throws(() => editorialTarget(layer, long, 'unknown'));
});
test('protected fragments are masked, restored exactly, and deletion or invention is rejected', () => {
  const source = 'Camille invite à 14:30 le 12/09/2030. Contact https://example.test/qr et +243 999 123 456. ' + long;
  const terms = protectedEditorialTerms(source, ['Camille']);
  const redacted = redactEditorial(source, terms);
  assert.ok(!redacted.text.includes('Camille') && !redacted.text.includes('example.test'));
  assert.equal(restoreEditorial(redacted.text, redacted.fragments, redacted.order), source.trim());
  assert.throws(() => restoreEditorial(redacted.text.replace(redacted.fragments[0].token, ''), redacted.fragments, redacted.order));
  assert.throws(() => restoreEditorial(redacted.text.replace(redacted.fragments[0].token, '__IF_PROTECTED_999__'), redacted.fragments, redacted.order));
  const reordered = redacted.fragments.length > 1 ? redacted.text.replace(redacted.fragments[0].token, '__TEMP__').replace(redacted.fragments[1].token, redacted.fragments[0].token).replace('__TEMP__', redacted.fragments[1].token) : null;
  if (reordered) assert.throws(() => restoreEditorial(reordered, redacted.fragments, redacted.order));
  assert.throws(() => validateEditorialProposal(source, 'Bienvenue.', terms, { maxCharacters: 500 }));
  assert.throws(() => validateEditorialProposal(long, 'Bienvenue le 25/09/2030.', [], { maxCharacters: 100 }));
  assert.throws(() => validateEditorialProposal(long, long, [], { maxCharacters: 500 }));
  assert.throws(() => validateEditorialProposal(long, 'Une proposition encore bien trop longue.', [], { maxCharacters: 10 }));
});
test('explicit editorial selection retains original and geometry and resolves identically for guests', () => {
  const before = structuredClone(document);
  const selected = applyEditorialSelection(document, 'invitation', 'Bienvenue à notre célébration.', { sourceText: long, sourceVersion: 1, origin: 'AI_ASSISTED' });
  assert.deepEqual(document, before);
  assert.equal(selected.metadata.editorialOverrides.invitation.sourceText, long);
  assert.deepEqual(selected.elements, document.elements);
  for (const name of ['Camille', 'Alex']) {
    const layout = resolveDesignLayout(selected, { event: { invitationText: long }, guest: { name }, ceremonies: [{ name: 'Célébration' }] });
    assert.equal(layout.elements.find(element => element.id === 'invitation').resolvedText, 'Bienvenue à notre célébration.');
    assert.deepEqual(layout.errors, []);
  }
});

test('numeric protected terms never corrupt generated placeholders', () => {
  const source = 'Camille 0 et Camille 12 septembre 2030.';
  const terms = protectedEditorialTerms(source, ['Camille']);
  const masked = redactEditorial(source, terms);
  assert.equal(restoreEditorial(masked.text, masked.fragments, masked.order), source);
  assert.ok(!masked.text.includes('septembre'));
});

test('overflow policy alone never authorizes structured data for AI', () => {
  const source = structuredClone(document);
  const guest = source.elements.find(element => element.id === 'guest');
  guest.overflowPolicy = 'AI_ASSIST_ALLOWED';
  const result = resolveDesignLayout(source, { guest: { name: 'Nom protégé '.repeat(100) } });
  const error = result.errors.find(entry => entry.elementId === 'guest');
  assert.equal(error.assistanceEligible, false);
  assert.equal(error.code, 'TEXT_OVERFLOW');
  source.metadata.editorialFields.push({ elementId: 'guest', binding: 'guest.name' });
  assert.throws(() => validateDesignDocumentV2(source));
});
