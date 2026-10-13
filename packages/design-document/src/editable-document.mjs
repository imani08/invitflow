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

/** Editable scaffold only: never presented as an AI result before a provider proposal. */
export function createInitialComposition() {
  const doc = editableDocument(createProfessionalTemplate('typographic-luxury'));
  doc.metadata.initialCompositionSeed = true;
  for (const layer of doc.elements) if (layer.type !== 'QR') { layer.locked = false; layer.editable = true; }
  doc.elements.push({ id: 'ai-invitation-prose', name: 'Texte de votre invitation', type: 'TEXT', text: 'Partageons ensemble ce moment de joie.', x: 150, y: 780, width: 1180, height: 180, rotation: 0, zIndex: 50, locked: false, editable: true, fontId: 'georgia', fontFamily: 'Georgia', fontSize: 36, preferredFontSize: 36, minFontSize: 18, maxFontSize: 36, lineHeight: 1.2, overflowPolicy: 'SHRINK_WITH_LIMIT', color: '#32163a', opacity: 1 });
  return validateDesignDocumentV2(doc);
}

/** One bounded translation for the whole group, including layout overrides. */
export function moveEditableGroup(input, elementId, x, y) {
  const doc = structuredClone(input), anchor = doc.elements.find(layer => layer.id === elementId);
  if (!anchor || !Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Position invalide.');
  const group = (doc.metadata.editorGroups ?? []).find(group => group.elementIds.includes(elementId));
  const ids = new Set(group?.elementIds ?? [elementId]);
  const members = doc.elements.filter(layer => ids.has(layer.id));
  if (members.some(layer => layer.locked || !layer.editable || layer.type === 'BACKGROUND')) throw new TypeError('Déverrouillez tous les éléments du groupe avant de le déplacer.');
  const dx = Math.max(-Math.min(...members.map(layer => layer.x)), Math.min(x - anchor.x, ...members.map(layer => doc.canvas.width - layer.x - layer.width)));
  const dy = Math.max(-Math.min(...members.map(layer => layer.y)), Math.min(y - anchor.y, ...members.map(layer => doc.canvas.height - layer.y - layer.height)));
  for (const layer of members) { layer.x += dx; layer.y += dy; }
  for (const variant of doc.layoutVariants ?? []) for (const override of variant.overrides ?? []) {
    const layer = members.find(layer => layer.id === override.elementId);
    if (layer && override.bounds) override.bounds = { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
  }
  return doc;
}

/** Normalize typography at the editing boundary, including older saved designs. */
export function editableDocument(input) {
  const doc = splitReferenceArtwork(normalizeDesignDocumentV2(input));
  doc.metadata.editorMode = 'FULL';
  return doc;
}

/** Attach a READY private Media resource; never flatten the rest of the document. */
export function insertEditableImage(input, asset, targetId) {
  const doc = structuredClone(input);
  if (!asset || !/^[0-9a-f-]{36}$/i.test(asset.assetId) || !Number.isInteger(asset.width) || asset.width < 1 || !Number.isInteger(asset.height) || asset.height < 1) throw new TypeError('Ressource Media invalide.');
  const target = targetId ? doc.elements.find(layer => layer.id === targetId) : null;
  if (targetId && (!target || target.locked || !target.editable || !['IMAGE', 'SHAPE', 'BACKGROUND'].includes(target.type))) throw new TypeError('Sélectionnez une image, un fond ou une décoration déverrouillée.');
  const textureId = target?.type === 'BACKGROUND' ? `texture-${target.id}` : null;
  let image = textureId ? doc.elements.find(layer => layer.id === textureId) : target;
  if (image?.locked || image?.editable === false) throw new TypeError('Déverrouillez la texture avant de la remplacer.');
  if (!image) {
    if (doc.elements.length >= 100) throw new TypeError('La limite de 100 calques est atteinte.');
    const factor = Math.min(doc.canvas.width * .7 / asset.width, doc.canvas.height * .55 / asset.height, 1);
    const width = textureId ? doc.canvas.width : Math.max(1, Math.round(asset.width * factor));
    const height = textureId ? doc.canvas.height : Math.max(1, Math.round(asset.height * factor));
    image = { id: textureId ?? `photo-${crypto.randomUUID().slice(0, 8)}`, name: textureId ? 'Texture du fond' : 'Photo', type: 'IMAGE', x: textureId ? 0 : Math.round((doc.canvas.width - width) / 2), y: textureId ? 0 : Math.round(doc.canvas.height * .12), width, height, rotation: 0, opacity: 1, locked: false, editable: true, zIndex: textureId ? target.zIndex + .01 : Math.max(0, ...doc.elements.map(layer => layer.zIndex)) + 1 };
    doc.elements.push(image);
  }
  const role = textureId ? 'TEXTURE' : image.type === 'SHAPE' ? 'DECORATION' : image.role ?? 'PHOTO';
  Object.assign(image, { type: 'IMAGE', role, assetId: asset.assetId, originalAssetId: asset.assetId, sourceWidth: asset.width, sourceHeight: asset.height, fit: image.fit ?? 'cover', cropX: 50, cropY: 50, cropScale: 1 });
  for (const key of ['ornamentId', 'derivedAssetId', 'focalPoint', 'fill', 'stroke', 'strokeWidth', 'shape', 'overlay']) delete image[key];
  doc.assets = [...doc.assets.filter(entry => entry.assetId !== asset.assetId), { id: asset.assetId, assetId: asset.assetId, role: 'COUPLE_PHOTO', width: asset.width, height: asset.height, mimeType: 'image/webp' }];
  doc.metadata.editorMode = 'FULL';
  return { document: validateDesignDocumentV2(doc), layerId: image.id };
}
