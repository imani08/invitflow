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
