import { validateDesignDocumentV2 } from './index.mjs';

const families = {
  'botanical-elegance': { name: 'Botanical Elegance', palette: ['#F7F4EB', '#263F34', '#879580', '#A88650'], mask: 'watercolor-soft-01' },
  'photo-editorial-luxury': { name: 'Photo Editorial Luxury', palette: ['#F3EDE1', '#292622', '#C2A271', '#D6C3A9'], mask: 'none' },
  'african-contemporary': { name: 'African Contemporary', palette: ['#F6EFE2', '#392339', '#986C4C', '#BE995F'], mask: 'organic-portrait-01' },
};
export const PROFESSIONAL_TEMPLATE_IDS = Object.freeze(Object.keys(families));
const genericEventTypes = Object.freeze(['WEDDING', 'DOT', 'BIRTHDAY', 'ANNIVERSARY', 'GRADUATION', 'CORPORATE', 'RELIGIOUS', 'FUNERAL_OR_MEMORIAL', 'BABY_SHOWER', 'CONFERENCE', 'GALA', 'CUSTOM', 'BAPTISM', 'DINNER', 'CEREMONY', 'OTHER']);
const paletteSets = Object.freeze({
  signature: familyId => families[familyId].palette,
  ivoryGold: () => ['#FBF8F0', '#302A25', '#897C68', '#A88650'],
  emeraldIvory: () => ['#F4F0E5', '#173B32', '#536B5F', '#C39A42'],
  midnight: () => ['#24212B', '#F7F0E4', '#CBBDA4', '#D6B66F'],
});
export const PROFESSIONAL_RECIPES = Object.freeze([
  ...Object.keys(families).map(id => ({ id, family: id, mediaStrategy: 'SINGLE_PHOTO', supportedMediaStrategies: Object.freeze(id === 'photo-editorial-luxury' ? ['SINGLE_PHOTO', 'BACKGROUND_PHOTO', 'FOREGROUND_PHOTO', 'MULTI_PHOTO'] : ['SINGLE_PHOTO']), photoRequired: true, photoOrientation: 'ANY', supportedEventTypes: Object.freeze(['WEDDING', 'DOT']), supportedCeremonyCounts: Object.freeze(['0', '1', '2', '3', '4+']), supportedTextDensity: Object.freeze(['LOW', 'MEDIUM', 'HIGH']), supportsTable: true, supportsQr: true, supportsDressCode: true, styleTags: Object.freeze(id === 'botanical-elegance' ? ['botanical', 'classic', 'floral'] : id === 'african-contemporary' ? ['african-contemporary', 'modern', 'geometric'] : ['editorial', 'luxury', 'minimal']), moodTags: Object.freeze(id === 'botanical-elegance' ? ['warm', 'romantic', 'natural'] : id === 'african-contemporary' ? ['bold', 'warm', 'contemporary'] : ['formal', 'elegant', 'minimal']), paletteTags: Object.freeze(['gold', 'ivory', 'green']), paletteIds: Object.freeze(Object.keys(paletteSets)) })),
  ...[
    { id: 'botanical-illustration', family: 'botanical-elegance', styleTags: ['botanical', 'classic', 'floral'], moodTags: ['warm', 'romantic', 'natural'] },
    { id: 'typographic-luxury', family: 'photo-editorial-luxury', styleTags: ['editorial', 'luxury', 'minimal'], moodTags: ['formal', 'elegant', 'minimal'] },
    { id: 'african-contemporary-graphic', family: 'african-contemporary', styleTags: ['african-contemporary', 'modern', 'geometric'], moodTags: ['bold', 'warm', 'contemporary'] },
  ].map(recipe => ({ ...recipe, mediaStrategy: 'NO_PHOTO', supportedMediaStrategies: Object.freeze(['NO_PHOTO']), photoRequired: false, supportedEventTypes: genericEventTypes, supportedCeremonyCounts: Object.freeze(['0', '1', '2', '3', '4+']), supportedTextDensity: Object.freeze(['LOW', 'MEDIUM', 'HIGH']), supportsTable: true, supportsQr: true, supportsDressCode: true, paletteTags: Object.freeze(['gold', 'ivory', 'green']), paletteIds: Object.freeze(Object.keys(paletteSets)) })),
]);
export function compatibleProfessionalRecipes({ hasPhotos, photoCount = 0, photoOrientation = 'UNKNOWN' } = {}) {
  const available = hasPhotos === true && Number.isInteger(photoCount) && photoCount > 0;
  return PROFESSIONAL_RECIPES.filter(recipe => !recipe.photoRequired || (available && (recipe.photoOrientation === 'ANY' || recipe.photoOrientation === photoOrientation)));
}
const bounds = (x, y, width, height) => ({ x, y, width, height });
const base = (id, type, box, zIndex = 50) => ({ id, name: id, type, ...box, rotation: 0, locked: true, editable: false, zIndex });
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);

/** Original compositions. Asset IDs must come from authenticated Media, never a seeded placeholder UUID. */
export function createProfessionalTemplate(id, photos = {}, privateAssets = {}, options = {}) {
  const recipe = PROFESSIONAL_RECIPES.find(entry => entry.id === id);
  const familyId = recipe?.family;
  const family = families[familyId];
  const noPhoto = recipe?.mediaStrategy === 'NO_PHOTO';
  if (!family) throw new TypeError('Unknown professional template');
  const mediaStrategy = options.mediaStrategy ?? recipe.mediaStrategy;
  const paletteId = options.paletteId ?? 'signature';
  if (!recipe.supportedMediaStrategies.includes(mediaStrategy) || !recipe.paletteIds.includes(paletteId)) throw new TypeError('Composition variant is not registered for this recipe');
  const palette = paletteSets[paletteId](familyId);
  const [paper, ink, muted, gold] = palette;
  const editorial = familyId === 'photo-editorial-luxury';
  const african = familyId === 'african-contemporary';
  const elements = [];
  const text = (key, binding, box, size, minimum, lines = 2, fontId = 'georgia', extra = {}) => {
    elements.push({ ...base(key, 'TEXT', box), text: '', binding, role: key === 'guest' ? 'GUEST_NAME' : key === 'table' ? 'TABLE_INFO' : 'BODY', fontId, fontFamily: fontId === 'arial' ? 'Arial' : 'Georgia', preferredFontSize: size, fontSize: size, minFontSize: minimum, maxFontSize: size, maxLines: lines, lineHeight: 1.2, overflowPolicy: 'SHRINK_WITH_LIMIT', hideWhenEmpty: true, collapseSpace: true, fontWeight: 400, align: 'center', color: ink, ...extra });
  };
  const shape = (key, box, fill, extra = {}) => elements.push({ ...base(key, 'SHAPE', box, 8), shape: 'RECTANGLE', fill, stroke: fill, strokeWidth: 0, ...extra });
  elements.push({ ...base('paper', 'BACKGROUND', bounds(0, 0, 1480, 2100), 0), fill: paper });
  // Original geometry only: fine edge rhythms, with no borrowed cultural motif or raster asset.
  if (african) {
    for (let n = 0; n < 8; n++) {
      shape(`rhythm-left-${n}`, bounds(35, 450 + n * 120, 18, 65), n % 2 ? muted : gold);
      shape(`rhythm-right-${n}`, bounds(1427, 490 + n * 120, 18, 65), n % 2 ? gold : muted);
    }
  } else {
    shape('left-rule', bounds(45, 490, 3, 700), gold);
    shape('right-rule', bounds(1432, 490, 3, 700), gold);
  }
  shape('heading-rule', bounds(590, 250, 300, 3), gold);
  text('guest', 'guest.name', bounds(130, 90, 1220, 145), 70, 40, 3);
  text('couple', 'event.coupleNames', bounds(150, 290, 1180, 100), 55, 38);
  text('event-title', 'event.title', bounds(200, 397, 1080, 65), 28, 25, 2, 'arial');
  const slots = noPhoto ? [] : mediaStrategy === 'BACKGROUND_PHOTO'
    ? [{ id: 'backgroundPhoto', elementId: 'background-photo', required: true, role: 'BACKGROUND', maskId: 'none', bounds: bounds(0, 0, 1480, 2100), opacity: 0.34, overlay: { type: 'solid', color: paper, opacity: 0.62 } }]
    : [
      { id: 'mainPhoto', elementId: 'main-photo', required: true, role: mediaStrategy === 'FOREGROUND_PHOTO' ? 'FOREGROUND' : 'PHOTO', maskId: family.mask, bounds: bounds(editorial ? 150 : 240, 495, editorial ? 1180 : 1000, 590), opacity: 1 },
      ...(editorial && mediaStrategy === 'SINGLE_PHOTO' ? [{ id: 'backgroundPhoto', elementId: 'background-photo', required: false, role: 'BACKGROUND', maskId: 'none', bounds: bounds(0, 0, 1480, 2100), opacity: 0.16, overlay: { type: 'solid', color: paper, opacity: 0.35 } }, { id: 'secondaryPhoto', elementId: 'secondary-photo', required: false, role: 'FOREGROUND', maskId: 'organic-portrait-01', bounds: bounds(1010, 675, 320, 410), opacity: 1 }] : []),
      ...(mediaStrategy === 'MULTI_PHOTO' ? [{ id: 'secondaryPhoto', elementId: 'secondary-photo', required: true, role: 'FOREGROUND', maskId: 'organic-portrait-01', bounds: bounds(1010, 675, 320, 410), opacity: 1 }] : []),
    ];
  for (const slot of slots) {
    const photo = photos[slot.id];
    if (photo) elements.push(photoLayer(slot, photo));
    else if (slot.id === 'mainPhoto') shape(slot.elementId, slot.bounds, editorial ? '#DDD1BD' : '#E9E7DA', { zIndex: 10 });
  }
  if (mediaStrategy === 'BACKGROUND_PHOTO') shape('main-photo', bounds(240, 495, 1000, 590), 'transparent', { zIndex: 10 });
  if (familyId === 'botanical-elegance' && privateAssets.botanicalBranch) {
    for (const [key, box, rotation] of [['branch-right', bounds(1320, 460, 150, 740), 0], ['branch-left', bounds(10, 1470, 145, 500), 180]]) {
      elements.push({ ...photoLayer({ elementId: key, bounds: box, role: 'DECORATION', maskId: 'none', opacity: 0.8 }, privateAssets.botanicalBranch), rotation, zIndex: 20 });
    }
  }
  text('date', 'event.date', bounds(150, 1105, 1180, 95), editorial ? 68 : 38, 30, 2);
  text('invitation', 'event.invitationText', bounds(180, 1215, 1120, 240), 33, 28, 7, 'georgia', { overflowPolicy: 'AI_ASSIST_ALLOWED' });
  text('table', 'guest.table', bounds(180, 1970, 530, 50), 27, 25, 1, 'arial');
  elements.push({ ...base('table-label', 'TEXT', bounds(180, 1935, 530, 30)), role: 'BODY', text: 'TABLE', visibility: { type: 'binding-exists', binding: 'guest.table' }, fontId: 'arial', fontFamily: 'Arial', fontSize: 20, preferredFontSize: 20, minFontSize: 20, maxFontSize: 20, maxLines: 1, lineHeight: 1.2, overflowPolicy: 'ERROR', hideWhenEmpty: true, collapseSpace: true, fontWeight: 400, align: 'center', color: ink });
  text('contact', 'contact', bounds(730, 1970, 570, 50), 26, 25, 1, 'arial');
  elements.push({ ...base('qr', 'QR', bounds(1250, 1840, 130, 130), 60), binding: 'qr', visibility: { type: 'binding-exists', binding: 'qr' }, source: 'guest_access_token', minSize: 96, maxSize: 256, quietZone: 4 });
  // One generous section, two columns, three vertical columns, then a 2 × 2 programme.
  const programme = bounds(130, 1490, 540, 210);
  const fields = [['name', 0, 38, 28, 2], ['date', 67, 28, 28, 1], ['time', 103, 28, 28, 1], ['venue', 140, 29, 28, 2], ['address', 206, 28, 28, 2], ['reference', 272, 28, 28, 1], ['dressCode', 308, 28, 28, 2]];
  for (const [field, offset, size, minimum, lines] of fields) {
    text(`ceremony-${field}`, `ceremony.${field}`, bounds(programme.x, programme.y + offset, programme.width, field === 'name' || lines === 2 ? 65 : 40), size, minimum, lines, field === 'name' ? 'georgia' : 'arial', { groupId: 'programme', align: 'left', lineHeight: 1.1 });
  }
  const group = { id: 'programme', binding: 'ceremonies', layoutSlot: 'programme', bounds: { ...programme, height: 375 }, elementIds: fields.map(([field]) => `ceremony-${field}`), direction: 'vertical', columns: 1, gap: 30 };
  const configurations = [
    ['noCeremony', 0, bounds(130, 1490, 1180, 350), 1],
    ['singleCeremony', 1, bounds(300, 1480, 880, 345), 1],
    ['twoCeremonies', 2, bounds(130, 1480, 1180, 345), 2],
    ['threeCeremonies', 3, bounds(130, 1290, 1180, 535), 3],
    ['multiCeremony', 4, bounds(130, 1190, 1180, 635), 2],
  ];
  const document = {
    schemaVersion: 2, version: 1,
    metadata: { family: familyId, name: noPhoto ? ({ 'botanical-illustration': 'Botanical Illustration', 'typographic-luxury': 'Typographic Luxury', 'african-contemporary-graphic': 'African Contemporary Graphic' })[id] : family.name, layoutRecipe: id, mediaStrategy, photoRequired: !noPhoto, photoComposition: noPhoto ? 'NONE' : mediaStrategy === 'BACKGROUND_PHOTO' ? 'FULL_BLEED_BACKGROUND' : mediaStrategy === 'MULTI_PHOTO' ? 'DUAL_PHOTO' : mediaStrategy === 'FOREGROUND_PHOTO' ? 'FOREGROUND_MASK' : 'CENTERED_MASK', ceremonyLayout: 'COUNT_ADAPTIVE', guestHeaderLayout: 'CENTERED', tableLayout: 'CONDITIONAL_FOOTER', backgroundTreatment: 'SOLID_PAPER', palette, paletteId, fontSet: ['georgia', 'arial'], maskSet: noPhoto ? [] : [family.mask, ...(editorial ? ['organic-portrait-01'] : [])], decorationSet: african ? ['geometric-rhythms'] : editorial ? ['fine-rules'] : ['botanical-branch'], release: 1, format: { widthMm: 148, heightMm: 210 }, photoSlots: slots, editorialFields: [{ elementId: 'invitation', binding: 'event.invitationText' }], personalization: { policy: 'professional-v1', colors: [ink, '#41352B'], fonts: ['georgia', 'arial'], photoFields: ['assetId', 'originalAssetId', 'derivedAssetId', 'sourceWidth', 'sourceHeight', 'cropX', 'cropY', 'cropScale', 'focalPoint'], textFields: ['color', 'fontId', 'fontFamily'] }, assetProvenance: 'Original code geometry; photos supplied privately by the client. Botanical foliage awaits private Media onboarding.' },
    canvas: { width: 1480, height: 2100, unit: 'px' }, safeArea: { top: 80, right: 80, bottom: 80, left: 80 }, bleed: 0,
    theme: { category: 'WEDDING', style: 'CLASSIC', palette: family.palette, tokens: { background: paper, primary: ink, secondary: gold, font: 'Georgia' } },
    assets: [], variables: [], constraints: { safeMargin: 80, allowOverflow: false }, layouts: [{ id: 'portrait', name: 'A5 portrait', width: 1480, height: 2100 }], ceremonyRules: [], exportProfiles: [{ id: 'portrait', width: 1480, height: 2100, unit: 'px' }], elements, groups: [group],
    layoutVariants: configurations.map(([variant, count, box, columns]) => ({ id: variant, when: { type: 'ceremony-count', operator: count === 4 ? 'gte' : 'eq', value: count }, overrides: count >= 3 ? [{ elementId: 'main-photo', bounds: bounds(240, 495, 1000, count === 4 ? 260 : 360) }, { elementId: 'date', bounds: bounds(150, count === 4 ? 770 : 870, 1180, 85) }, { elementId: 'invitation', bounds: bounds(180, count === 4 ? 875 : 975, 1120, 280) }] : [], groupLayouts: [{ groupId: 'programme', bounds: box, columns, direction: 'vertical', gap: 35 }] })),
  };
  if (noPhoto) {
    // Independent typographic composition: the former image area becomes the hierarchy.
    const move = (key, box, size) => { const layer = elements.find(entry => entry.id === key); Object.assign(layer, box); if (size) Object.assign(layer, { fontSize: size, preferredFontSize: size, maxFontSize: size }); };
    move('couple', bounds(180, 380, 1120, 190), editorial ? 100 : 82);
    move('event-title', bounds(200, 600, 1080, 80), 32);
    move('date', bounds(180, 730, 1120, 140), editorial ? 95 : 68);
    move('invitation', bounds(220, 950, 1040, 260), 36);
    shape('composition-divider', bounds(460, 900, 560, 3), gold);
    if (african) {
      shape('graphic-crown', bounds(600, 310, 280, 12), gold);
      shape('graphic-baseline', bounds(600, 1230, 280, 12), muted);
    }
    document.layoutVariants = configurations.map(([variant, count]) => ({ id: variant, when: { type: 'ceremony-count', operator: count === 4 ? 'gte' : 'eq', value: count }, overrides: count >= 3 ? [{ elementId: 'invitation', bounds: bounds(220, 940, 1040, 240) }] : [], groupLayouts: [{ groupId: 'programme', bounds: count >= 3 ? bounds(130, 1190, 1180, 635) : bounds(count === 1 ? 300 : 130, 1340, count === 1 ? 880 : 1180, 485), columns: count >= 4 ? 2 : Math.max(count, 1), direction: 'vertical', gap: 35 }] }));
  }
  document.metadata.sharedAssetIds = privateAssets.botanicalBranch && familyId === 'botanical-elegance' ? [privateAssets.botanicalBranch.assetId] : [];
  document.metadata.zones = elements.map(({ id: elementId, type, x, y, width, height }) => ({ elementId, kind: slots.some((slot) => slot.elementId === elementId) ? 'PHOTO_SLOT' : type, bounds: { x, y, width, height } }));
  document.metadata.assetProvenance = familyId === 'botanical-elegance' && privateAssets.botanicalBranch ? 'Original InvitaFlow generated botanical decoration; real private Media reference. Photos provided by the client.' : 'Original code geometry. Photos provided by the client. Botanical publication requires the generated private decoration.';
  return validateDesignDocumentV2(document);
}

function photoLayer(slot, photo) {
  if (!/^[0-9a-f-]{36}$/i.test(photo.assetId ?? '') || !Number.isInteger(photo.width) || !Number.isInteger(photo.height) || photo.width < 1 || photo.height < 1) throw new TypeError('A real Media asset and its dimensions are required');
  return { ...base(slot.elementId, 'IMAGE', slot.bounds, slot.role === 'BACKGROUND' ? 2 : 15), assetId: photo.assetId, originalAssetId: photo.assetId, sourceWidth: photo.width, sourceHeight: photo.height, role: slot.role, fit: 'cover', cropX: 50, cropY: 50, cropScale: 1, focalPoint: { x: 0.5, y: slot.id === 'mainPhoto' ? 0.3 : 0.5 }, opacity: slot.opacity, maskId: slot.maskId, ...(slot.overlay ? { overlay: structuredClone(slot.overlay) } : {}) };
}

/** Fill only an explicitly declared slot, preserving its geometry and stack position. */
export function fillProfessionalPhotoSlot(document, slotId, photo) {
  const next = structuredClone(document);
  const slot = next.metadata?.photoSlots?.find((entry) => entry.id === slotId);
  if (!slot || next.metadata?.personalization?.policy !== 'professional-v1') throw new TypeError('Photo slot unavailable');
  const current = next.elements.find((entry) => entry.id === slot.elementId);
  const layer = photoLayer(slot, photo);
  if (current) next.elements[next.elements.indexOf(current)] = layer;
  else next.elements.push(layer);
  return validateDesignDocumentV2(next);
}

/** Use the persisted document as authority, so deleting policy metadata cannot bypass the lock. */
export function assertProfessionalPersonalization(previous, candidate) {
  if (previous?.metadata?.personalization?.policy !== 'professional-v1') return;
  const policy = previous.metadata.personalization;
  const allowedSlotIds = new Set(previous.metadata.photoSlots.map((slot) => slot.elementId));
  const normalized = structuredClone(candidate);
  normalized.version = previous.version;
  normalized.assets = previous.assets;
  for (const layer of normalized.elements) {
    const prior = previous.elements.find((entry) => entry.id === layer.id);
    const slot = previous.metadata.photoSlots.find((entry) => entry.elementId === layer.id);
    if (slot && layer.type === 'IMAGE') {
      const authority = prior?.type === 'IMAGE' ? prior : photoLayer(slot, { assetId: layer.assetId, width: layer.sourceWidth, height: layer.sourceHeight });
      for (const key of policy.photoFields) { if (key in authority) layer[key] = authority[key]; else delete layer[key]; }
      if (canonical(layer) !== canonical(authority)) throw new TypeError('Photo geometry is locked');
      if (prior) normalized.elements[normalized.elements.indexOf(layer)] = structuredClone(prior);
      else normalized.elements = normalized.elements.filter((entry) => entry !== layer);
    } else if (prior?.type === 'TEXT') {
      if (!policy.colors.includes(layer.color) || !policy.fonts.includes(layer.fontId) || layer.fontFamily !== (layer.fontId === 'arial' ? 'Arial' : 'Georgia')) throw new TypeError('Palette or font not authorized');
      for (const key of policy.textFields) layer[key] = prior[key];
    }
  }
  // Images added to optional declared slots are allowed; arbitrary additions/deletions are not.
  normalized.elements = normalized.elements.filter((entry) => previous.elements.some((prior) => prior.id === entry.id) || !allowedSlotIds.has(entry.id));
  if (canonical(normalized) !== canonical(previous)) throw new TypeError('The template structure is locked');
}

/** Controlled descriptors, not coordinates. Extend the registered recipes to authorize new combinations. */
export const PROFESSIONAL_GRAMMAR_FIELDS = Object.freeze([
  'family', 'layoutRecipe', 'mediaStrategy', 'photoRequired', 'photoComposition',
  'ceremonyLayout', 'guestHeaderLayout', 'tableLayout', 'palette', 'paletteId', 'fontSet',
  'maskSet', 'decorationSet', 'backgroundTreatment',
]);
const setDimensions = new Set(['fontSet', 'maskSet', 'decorationSet']);
function grammarValues(metadata) {
  return Object.fromEntries(PROFESSIONAL_GRAMMAR_FIELDS.map(key => [key,
    setDimensions.has(key) && Array.isArray(metadata[key]) ? [...metadata[key]].sort() : structuredClone(metadata[key]),
  ]));
}

/** Reject unknown fields and incompatible cross-recipe choices; the graphical validator still applies afterwards. */
export function validateProfessionalComposition(configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration)) throw new TypeError('Composition configuration required');
  if (Object.keys(configuration).some(key => !PROFESSIONAL_GRAMMAR_FIELDS.includes(key))) throw new TypeError('Unknown composition dimension; arbitrary coordinates are forbidden');
  const authority = createProfessionalTemplate(configuration.layoutRecipe, {}, {}, { paletteId: configuration.paletteId, mediaStrategy: configuration.mediaStrategy }).metadata;
  const values = grammarValues(configuration);
  if (canonical(values) !== canonical(grammarValues(authority))) throw new TypeError('Composition dimensions are incompatible with the registered recipe');
  return values;
}

/** Canonical, collision-free descriptor for diversity comparisons; excludes guest data, photos, seed and version. */
export function professionalCompositionFingerprint(configuration) {
  return 'invitaflow-composition-v1:' + canonical(validateProfessionalComposition(configuration));
}

/** Serializable reproducibility envelope. No generation, persistence or history store is performed here. */
export function professionalCompositionManifest(document, seed) {
  const validated = validateDesignDocumentV2(document);
  if (typeof seed !== 'string' || !seed.trim() || seed.length > 128) throw new TypeError('A non-empty reproducible seed (maximum 128 characters) is required');
  const composition = validateProfessionalComposition(grammarValues(validated.metadata));
  return { grammarVersion: 1, recipeRelease: validated.metadata.release, designVersion: validated.version,
    seed, composition, fingerprint: professionalCompositionFingerprint(composition) };
}
