import { createProfessionalTemplate } from './professional-templates.mjs';
import { validateDesignDocumentV2 } from './index.mjs';

export const REFERENCE_TEMPLATES = Object.freeze([
  { id: 'reference-01-ivory', slug: 'reference-01-ivory', name: 'Modèle 01 · Ivoire botanique', description: 'Référence portrait : en-tête invité, collage aquarelle, texte central et programme en deux colonnes. Ornements redessinés ; Great Vibes remplace la calligraphie originale.', category: 'WEDDING', style: 'REFERENCE_01', version: 1, tags: ['REFERENCE', 'PROFESSIONAL', 'PORTRAIT'], ceremonyTypes: ['UNIVERSAL'], preview: { background: '#f5f2e5', accent: '#253652', style: 'REFERENCE_01' } },
  { id: 'reference-02-gold', slug: 'reference-02-gold', name: 'Modèle 02 · Carré doré', description: 'Référence carrée : étiquette table, bandeau invité, photo latérale et programme central. Texture et détourage approchés ; Great Vibes remplace la calligraphie originale.', category: 'WEDDING', style: 'REFERENCE_02', version: 1, tags: ['REFERENCE', 'PROFESSIONAL', 'SQUARE'], ceremonyTypes: ['UNIVERSAL'], preview: { background: '#e3d59a', accent: '#253652', style: 'REFERENCE_02' } },
]);

/** Closed print sizes: unrelated/legacy designs retain the existing A5 contract. */
export function invitationPrintFormat(document) {
  return document?.metadata?.referenceId === 'reference-02-gold' && document.canvas?.width === 1500 && document.canvas?.height === 1500
    ? { widthMm: 150, heightMm: 150 } : { widthMm: 148, heightMm: 210 };
}

/** Reconstructed geometry, never the flattened reference JPG. All personal data remains bound or editable. */
export function createReferenceTemplate(id, photos = {}) {
  const info = REFERENCE_TEMPLATES.find(item => item.id === id);
  if (!info) throw new TypeError('Unknown reference template');
  const square = id === 'reference-02-gold';
  const width = 1500, height = square ? 1500 : 2121;
  const document = createProfessionalTemplate('typographic-luxury');
  document.elements = []; document.groups = []; document.canvas = { width, height, unit: 'px' };
  document.safeArea = { top: 20, right: 20, bottom: 20, left: 20 };
  document.constraints = { safeMargin: 20, allowOverflow: false };
  document.layouts = [{ id, name: square ? 'Carré 150 mm' : 'Portrait A5', width, height }];
  document.exportProfiles = [{ id, width, height, unit: 'px' }];
  const color = '#111111', border = '#253652', paper = info.preview.background;
  document.theme = { category: 'WEDDING', style: info.style, palette: [paper, color, border, '#a69561'], tokens: { background: paper, primary: color, secondary: border, font: 'Arial' } };
  const box = (x, y, width, height) => ({ x, y, width, height });
  const base = (id, type, bounds, zIndex = 40) => ({ id, type, name: id, ...bounds, rotation: 0, locked: true, editable: false, zIndex });
  const shape = (id, bounds, fill = 'transparent', extra = {}) => document.elements.push({ ...base(id, 'SHAPE', bounds, 8), shape: 'RECTANGLE', fill, stroke: border, strokeWidth: 2.5, ...extra });
  const text = (id, binding, bounds, size, extra = {}) => document.elements.push({ ...base(id, 'TEXT', bounds), binding, role: id === 'guest' ? 'GUEST_NAME' : id === 'table' ? 'TABLE_INFO' : 'BODY', text: '', fontId: 'arial', fontFamily: 'Arial', preferredFontSize: size, fontSize: size, minFontSize: Math.max(15, Math.round(size * .68)), maxFontSize: size, maxLines: 3, lineHeight: 1.15, overflowPolicy: 'SHRINK_WITH_LIMIT', hideWhenEmpty: true, collapseSpace: true, fontWeight: 400, align: 'center', color, ...extra });
  document.elements.push({ ...base('paper', 'BACKGROUND', box(0, 0, width, height), 0), fill: paper });
  shape('reference-art', box(0, 0, width, height), paper, { zIndex: 1, strokeWidth: 0, ornamentId: square ? 'reference-gold-v1' : 'reference-ivory-v1' });
  shape('table-paper', square ? box(38, 40, 322, 225) : box(36, 25, 310, 235), '#ffffff', { ornamentId: 'reference-table-v1', visibility: { type: 'binding-exists', binding: 'guest.table' }, rotation: square ? -5 : 0 });
  shape('table-frame', square ? box(43, 52, 303, 207) : box(67, 46, 238, 205), 'transparent', { visibility: { type: 'binding-exists', binding: 'guest.table' } });
  text('table-caption', 'guest.table', square ? box(63, 66, 260, 44) : box(80, 62, 210, 32), square ? 37 : 20, { binding: undefined, text: square ? 'TABLE' : 'table', fontWeight: square ? 700 : 400, visibility: { type: 'binding-exists', binding: 'guest.table' } });
  text('table', 'guest.table', square ? box(68, 143, 259, 75) : box(81, 126, 210, 60), square ? 37 : 28, { fontWeight: 700, maxLines: 2 });
  shape('guest-frame', square ? box(380, 72, 975, 137) : box(570, 64, 460, 136), square ? '#ffffff' : 'transparent');
  text('guest', 'guest.name', square ? box(405, 89, 925, 100) : box(586, 80, 428, 110), square ? 69 : 65, { fontId: 'great-vibes', fontFamily: 'Great Vibes', align: square ? 'left' : 'center', maxLines: 2 });
  const slots = square ? [
    { id: 'mainPhoto', elementId: 'main-photo', bounds: box(0, 510, 480, 990), maskId: 'organic-portrait-01', role: 'PHOTO', opacity: .76, required: false },
    { id: 'backgroundPhoto', elementId: 'background-photo', bounds: box(200, 0, 1300, 1400), maskId: 'none', role: 'BACKGROUND', opacity: .10, required: false },
  ] : [
    { id: 'mainPhoto', elementId: 'main-photo', bounds: box(0, 312, 980, 848), maskId: 'brush-edge-01', role: 'PHOTO', opacity: .93, required: false },
    { id: 'secondaryPhoto', elementId: 'secondary-photo', bounds: box(620, 340, 850, 735), maskId: 'brush-edge-01', role: 'PHOTO', opacity: .68, required: false },
  ];
  for (const slot of slots) {
    const photo = photos[slot.id];
    if (!photo && slot.id === 'mainPhoto') shape(slot.elementId, slot.bounds, 'transparent', { zIndex: 5, strokeWidth: 0 });
    if (photo) document.elements.push({ ...base(slot.elementId, 'IMAGE', slot.bounds, slot.role === 'BACKGROUND' ? 2 : 15), assetId: photo.assetId, originalAssetId: photo.assetId, sourceWidth: photo.width, sourceHeight: photo.height, role: slot.role, fit: 'cover', cropX: 50, cropY: 50, cropScale: 1, focalPoint: { x: .5, y: .5 }, maskId: slot.maskId, opacity: slot.opacity });
  }
  if (!square) shape('photo-frame', box(3, 310, 1494, 850), 'transparent', { zIndex: 25 });
  shape('body-frame', square ? box(202, 232, 1182, 1087) : box(307, 1203, 874, 325));
  text('invitation', 'event.invitationText', square ? box(403, 238, 940, 245) : box(343, 1212, 800, 306), square ? 36 : 38, { role: 'REFERENCE_BODY', maxLines: 7, overflowPolicy: 'AI_ASSIST_ALLOWED' });
  const programme = square ? box(220, 625, 1140, 235) : box(105, 1567, 625, 520);
  if (square) {
    for (const [field, x, y, w, h, size] of [['weekday', 470, 506, 230, 50, 32], ['day', 700, 490, 140, 96, 96], ['month', 860, 506, 220, 50, 32], ['year', 700, 581, 140, 26, 19]]) text('event-' + field, 'event.' + field, box(x, y, w, h), size, { maxLines: 1 });
    text('closing', undefined, box(300, 1205, 1020, 70), 31, { text: '{{closingText}}', maxLines: 2 });
    document.variables = [{ key: 'closingText', label: 'Phrase de clôture (facultatif)', type: 'TEXT', defaultValue: 'Votre présence à nos côtés rendra cette célébration encore plus belle et mémorable.', required: false }, { key: 'referenceContact', label: 'Contact (facultatif)', type: 'TEXT', defaultValue: '', required: false }];
  }
  const fields = square ? [
    ['name', 30, 0, 1080, 37, 32], ['time', 40, 38, 1060, 33, 29], ['venue', 35, 72, 1070, 40, 32], ['address', 30, 114, 1080, 48, 30], ['reference', 35, 164, 1070, 30, 27], ['dressCode', 40, 197, 1060, 38, 28],
  ] : [
    ['weekday', 25, 28, 220, 42, 27], ['day', 250, 8, 130, 95, 91], ['month', 390, 28, 210, 42, 27], ['year', 250, 96, 130, 22, 17],
    ['name', 28, 160, 570, 48, 30], ['time', 28, 215, 570, 40, 29], ['venue', 28, 265, 570, 55, 29], ['address', 28, 325, 570, 68, 28], ['reference', 28, 399, 570, 30, 24], ['dressCode', 28, 443, 570, 55, 29],
  ];
  const ids = [];
  if (!square) {
    shape('programme-frame', programme, 'transparent', { groupId: 'programme' }); ids.push('programme-frame');
    for (const [id, x, y, w] of [['weekday-top',25,20,220],['weekday-bottom',25,78,220],['month-top',390,20,210],['month-bottom',390,78,210]]) { shape(id, box(programme.x+x,programme.y+y,w,1.5),color,{strokeWidth:0,groupId:'programme'});ids.push(id); }
  } else for (const [id,x,y,w] of [['weekday-top',470,496,230],['weekday-bottom',470,564,230],['month-top',860,496,220],['month-bottom',860,564,220]]) shape(id,box(x,y,w,1.5),color,{strokeWidth:0});
  for (const [field, x, y, w, h, size] of fields) {
    const id = `ceremony-${field}`; ids.push(id);
    text(id, `ceremony.${field}`, box(programme.x + x, programme.y + y, w, h), size, { groupId: 'programme', fontWeight: ['name', 'venue'].includes(field) ? 700 : 400, maxLines: ['address', 'venue', 'dressCode'].includes(field) ? 3 : 1 });
  }
  document.groups = [{ id: 'programme', binding: 'ceremonies', layoutSlot: 'programme', bounds: programme, elementIds: ids, direction: 'vertical', columns: square ? 1 : 2, gap: 20 }];
  document.layoutVariants = [0, 1, 2, 3, 4].map(count => ({ id: ['noCeremony', 'singleCeremony', 'twoCeremonies', 'threeCeremonies', 'multiCeremony'][count], when: { type: 'ceremony-count', operator: count === 4 ? 'gte' : 'eq', value: count }, overrides: !square && count >= 3 ? [{ elementId: 'main-photo', bounds: box(0, 312, 980, 590) }, { elementId: 'photo-frame', bounds: box(3, 310, 1494, 600) }, { elementId: 'body-frame', bounds: box(307, 940, 874, 230) }, { elementId: 'invitation', bounds: box(343, 950, 800, 210) }] : [], groupLayouts: [{ groupId: 'programme', bounds: square ? box(220, 625, 1140, count < 3 ? Math.max(1, count) * 235 + Math.max(0, count - 1) * 20 : 550) : (count >= 3 ? box(105, 1200, 1280, 880) : box(105, 1567, 1280, 520)), columns: square ? (count < 3 ? 1 : 2) : count === 1 ? 1 : 2, direction: 'vertical', gap: 20 }] }));
  if (square) shape('contact-frame', box(435, 1379, 610, 105));
  if (square) text('contact', undefined, box(470, 1394, 530, 70), 23, { text: 'CONTACT\n{{referenceContact}}', maxLines: 3 });
  document.elements.push({ ...base('qr', 'QR', square ? box(1280, 1280, 200, 200) : box(355, 42, 203, 203), 60), binding: 'qr', visibility: { type: 'binding-exists', binding: 'qr' }, source: 'guest_access_token', minSize: 96, maxSize: 256, quietZone: 4 });
  document.metadata = { ...document.metadata, name: info.name, referenceId: id, referenceRelease: 1, origin: 'REFERENCE_RECONSTRUCTION', referenceSource: square ? 'modele-invitation-02.jpg' : 'modele-invitation-01.jpg', referenceDifferences: ['Great Vibes remplace la calligraphie non identifiée.', 'Ornements vectoriels et texture redessinés.', 'Photos originales isolées et détourage non fournis.', 'Les annotations techniques du JPG ne sont pas imprimées.', 'Zone QR ajoutée dans l’espace libre de l’en-tête (portrait) ou en bas à droite (carré).'], format: { widthMm: square ? 150 : 148, heightMm: square ? 150 : 210 }, photoRequired: false, mediaStrategy: 'SINGLE_PHOTO', photoSlots: slots, sharedAssetIds: [], assetProvenance: 'Reconstruction vectorielle InvitaFlow à partir des références fournies. Photos privées fournies séparément par le client.', editorialFields: [{ elementId: 'invitation', binding: 'event.invitationText' }], personalization: { policy: 'professional-v1', colors: [color, '#253652', '#41352B'], fonts: ['arial', 'georgia', 'great-vibes'], photoFields: ['assetId', 'originalAssetId', 'derivedAssetId', 'sourceWidth', 'sourceHeight', 'cropX', 'cropY', 'cropScale', 'focalPoint'], textFields: ['color', 'fontId', 'fontFamily'], variableFields: ['closingText', 'referenceContact'] } };
  return validateDesignDocumentV2(document);
}
