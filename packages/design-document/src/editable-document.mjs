import { createProfessionalTemplate } from './professional-templates.mjs';
import { normalizeDesignDocumentV2, validateDesignDocumentV2 } from './index.mjs';
import { splitReferenceArtwork } from './reference-art.mjs';

/** A genuine editable document, not an image pretending to contain layers. */
export function createBlankDesign() {
  const doc = createProfessionalTemplate('typographic-luxury');
  doc.elements = doc.elements.filter(layer => layer.type === 'BACKGROUND');
  doc.groups = [];
  doc.layoutVariants = doc.layoutVariants.map(variant => ({ ...variant, overrides: [], groupLayouts: [] }));
  doc.metadata = { name: 'Page vierge', editorMode: 'FULL', photoRequired: false };
  doc.variables = [];
  return validateDesignDocumentV2(doc);
}

/** Normalize typography at the editing boundary, including older saved designs. */
export function editableDocument(input) {
  const doc = splitReferenceArtwork(normalizeDesignDocumentV2(input));
  doc.metadata.editorMode = 'FULL';
  return doc;
}
