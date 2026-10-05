export { EDITORIAL_BINDINGS, editorialField, editorialTarget, protectedEditorialTerms, redactEditorial, restoreEditorial, validateEditorialProposal, applyEditorialSelection } from './editorial-assist.mjs';
import { assessImageResolution, renderOverlaySvg, renderVisualImageSvg, validateVisualProperties, visualOcclusionIssues } from './visual.mjs';
export { MASK_REGISTRY, IMAGE_ROLES, assessImageResolution, imageRenderBounds, renderOverlaySvg, renderVisualImageSvg } from './visual.mjs';
export { readPrivateImageDimensions } from './image-dimensions.mjs';
export { PROFESSIONAL_TEMPLATE_IDS, PROFESSIONAL_RECIPES, PROFESSIONAL_GRAMMAR_FIELDS, validateProfessionalComposition, professionalCompositionFingerprint, professionalCompositionManifest, compatibleProfessionalRecipes, createProfessionalTemplate, fillProfessionalPhotoSlot, assertProfessionalPersonalization } from './professional-templates.mjs';
export { AI_COMPOSER_VERSION, interpretComposerPreferences, composeDesignProposals } from './ai-composer.mjs';

export const ALLOWED_BINDINGS = new Set([
  'guest.name', 'guest.email', 'guest.table', 'event.title', 'event.coupleNames', 'event.invitationText',
  'event.date', 'event.venue', 'ceremonies', 'ceremony.name', 'ceremony.date', 'ceremony.time',
  'ceremony.venue', 'ceremony.address', 'ceremony.reference', 'ceremony.dressCode', 'contact', 'qr', 'qr.url',
]);

export const FONT_REGISTRY = Object.freeze({
  georgia: Object.freeze({ fontId: 'georgia', family: 'Georgia', fallback: 'serif', weights: [400, 700], styles: ['normal', 'italic'] }),
  arial: Object.freeze({ fontId: 'arial', family: 'Arial', fallback: 'sans-serif', weights: [400, 700], styles: ['normal', 'italic'] }),
  'times-new-roman': Object.freeze({ fontId: 'times-new-roman', family: 'Times New Roman', fallback: 'serif', weights: [400, 700], styles: ['normal', 'italic'] }),
});

const variantDefinitions = [
  { id: 'noCeremony', when: { type: 'ceremony-count', operator: 'eq', value: 0 } },
  { id: 'singleCeremony', when: { type: 'ceremony-count', operator: 'eq', value: 1 } },
  { id: 'twoCeremonies', when: { type: 'ceremony-count', operator: 'eq', value: 2 } },
  { id: 'threeCeremonies', when: { type: 'ceremony-count', operator: 'eq', value: 3 } },
  { id: 'multiCeremony', when: { type: 'ceremony-count', operator: 'gte', value: 4 } },
];
const legacyBinding = new Map([
  ['guest_name', 'guest.name'], ['guestname', 'guest.name'], ['guest_full_name', 'guest.name'],
  ['guest_email', 'guest.email'], ['table_name', 'guest.table'], ['tablename', 'guest.table'], ['tableName', 'guest.table'],
  ['event_name', 'event.title'], ['eventname', 'event.title'], ['event_date', 'event.date'],
  ['event_location', 'event.venue'], ['ceremony_name', 'ceremonies'], ['qr_code', 'qr.url'], ['rsvp_link', 'qr.url'],
]);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const stringOrEmpty = (value) => typeof value === 'string' ? value : '';
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const fail = (message) => { throw new TypeError(message); };
const rect = (value, label) => {
  if (!isObject(value)) fail(`${label} must be a bounds object`);
  const result = { x: finite(value.x, NaN), y: finite(value.y, NaN), width: finite(value.width, NaN), height: finite(value.height, NaN) };
  if (!Object.values(result).every(Number.isFinite) || result.x < 0 || result.y < 0 || result.width <= 0 || result.height <= 0) fail(`${label} bounds are invalid`);
  return result;
};
const safeEdges = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return { top: value, right: value, bottom: value, left: value };
  if (!isObject(value)) return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  const edges = Object.fromEntries(['top', 'right', 'bottom', 'left'].map((key) => [key, finite(value[key], fallback)]));
  if (Object.values(edges).some((edge) => edge < 0)) fail('Area edges cannot be negative');
  return edges;
};
function validateEdges(value, label, maximum) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= maximum) return;
  if (!isObject(value) || Object.keys(value).some((key) => !['top', 'right', 'bottom', 'left'].includes(key))) fail(`${label} edges are invalid`);
  for (const edge of ['top', 'right', 'bottom', 'left']) if (!Number.isFinite(value[edge]) || value[edge] < 0 || value[edge] > maximum) fail(`${label}.${edge} is outside the allowed range`);
}
const safeBinding = (value) => typeof value === 'string' && ALLOWED_BINDINGS.has(value);

export function isAllowedBinding(binding) { return safeBinding(binding); }

function inferredBinding(text) {
  const exact = /^\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/.exec(stringOrEmpty(text));
  return exact ? legacyBinding.get(exact[1]) ?? null : null;
}

function fontIdForFamily(family) {
  const normalized = stringOrEmpty(family).toLocaleLowerCase('en-US');
  if (normalized === 'arial') return 'arial';
  if (normalized === 'times new roman') return 'times-new-roman';
  return 'georgia';
}

function defaultVariants(includeNoCeremony = false) {
  return variantDefinitions.filter((variant) => includeNoCeremony || variant.id !== 'noCeremony').map((variant) => ({ ...variant, overrides: [], groupLayouts: [] }));
}

/** Upgrade a v1 document in memory. The source object is never mutated or persisted here. */
export function normalizeDesignDocumentV2(input) {
  if (!isObject(input)) fail('Design document must be an object');
  if (input.schemaVersion === 2) return structuredClone(input);
  if (input.schemaVersion !== 1) fail('Unsupported DesignDocument schemaVersion');
  const document = structuredClone(input);
  const canvas = isObject(document.canvas) ? document.canvas : {};
  const constraints = isObject(document.constraints) ? document.constraints : {};
  const safeArea = safeEdges(own(document, 'safeArea') ? document.safeArea : constraints.safeMargin, 64);
  const bleed = safeEdges(document.bleed, 0);
  const elements = Array.isArray(document.elements) ? document.elements.map((element) => {
    if (!isObject(element)) return element;
    const next = { ...element };
    if (next.type === 'TEXT') {
      const binding = safeBinding(next.binding) ? next.binding : inferredBinding(next.text);
      const family = stringOrEmpty(next.fontFamily) || stringOrEmpty(document.theme?.tokens?.font) || 'Georgia';
      next.fontId = typeof next.fontId === 'string' && own(FONT_REGISTRY, next.fontId) ? next.fontId : fontIdForFamily(family);
      next.preferredFontSize = finite(next.preferredFontSize, finite(next.maxFontSize, finite(next.fontSize, 36)));
      next.minFontSize = finite(next.minFontSize, finite(next.fontSize, 36) * 0.55);
      // v1 renderers already fitted content down to minFontSize; preserve that behavior in v2.
      next.overflowPolicy = ['USE_VARIANT', 'AI_ASSIST_ALLOWED'].includes(next.overflowPolicy) ? next.overflowPolicy : 'SHRINK_WITH_LIMIT';
      if (binding) next.binding = binding;
      if (next.hideWhenEmpty && binding && !next.visibility) next.visibility = { type: 'binding-exists', binding };
    } else if (next.type === 'QR' && !next.visibility) next.visibility = { type: 'binding-exists', binding: 'qr' };
    return next;
  }) : [];
  const width = finite(canvas.width, 1080);
  const height = finite(canvas.height, 1920);
  const groups = Array.isArray(document.groups) ? structuredClone(document.groups) : [];
  const variants = Array.isArray(document.layoutVariants) ? structuredClone(document.layoutVariants) : defaultVariants(true);
  return {
    ...document,
    schemaVersion: 2,
    canvas: { ...canvas, width, height, unit: 'px' },
    safeArea,
    bleed,
    elements,
    groups,
    layoutVariants: variants,
    metadata: { ...(isObject(document.metadata) ? document.metadata : {}) },
  };
}

function validateVisibility(value) {
  if (value === undefined) return;
  if (!isObject(value)) fail('Visibility rule must be an object');
  if (value.type === 'binding-exists') {
    if (Object.keys(value).some((key) => !['type', 'binding'].includes(key)) || !safeBinding(value.binding) || value.binding === 'ceremonies' || value.binding.startsWith('ceremony.')) fail('Visibility binding is not allowed');
    return;
  }
  if (value.type === 'ceremony-count') {
    if (Object.keys(value).some((key) => !['type', 'operator', 'value'].includes(key)) || !['eq', 'gte'].includes(value.operator) || !Number.isInteger(value.value) || value.value < 0 || value.value > 100) fail('Ceremony visibility rule is invalid');
    return;
  }
  fail('Visibility rule type is not supported');
}

function validateGroup(group, elementById, canvas) {
  if (!isObject(group) || Object.keys(group).some((key) => !['id', 'binding', 'layoutSlot', 'bounds', 'elementIds', 'direction', 'columns', 'gap'].includes(key))) fail('A repeat group contains unsupported fields');
  if (typeof group.id !== 'string' || !/^[a-z][a-z0-9-]{0,59}$/.test(group.id) || group.binding !== 'ceremonies' || typeof group.layoutSlot !== 'string' || !/^[a-z][a-z0-9-]{0,59}$/.test(group.layoutSlot)) fail('Repeat group identity or binding is invalid');
  const bounds = rect(group.bounds, `group.${group.id}`);
  if (bounds.x + bounds.width > canvas.width || bounds.y + bounds.height > canvas.height) fail('Repeat group bounds exceed canvas');
  if (!Array.isArray(group.elementIds) || !group.elementIds.length || group.elementIds.some((id) => typeof id !== 'string' || !elementById.has(id))) fail('Repeat group references an unknown element');
  if (!['vertical', 'horizontal'].includes(group.direction) || !Number.isInteger(group.columns) || group.columns < 1 || group.columns > 4 || typeof group.gap !== 'number' || !Number.isFinite(group.gap) || group.gap < 0 || group.gap > 1000) fail('Repeat group layout is invalid');
  for (const id of group.elementIds) if (elementById.get(id)?.groupId !== group.id) fail('Repeat group membership does not match the element');
}

export function validateDesignDocumentV2(input) {
  if (!isObject(input) || input.schemaVersion !== 2) fail('DesignDocument v2 required');
  const rootKeys = ['schemaVersion', 'metadata', 'canvas', 'theme', 'assets', 'variables', 'constraints', 'layouts', 'ceremonyRules', 'exportProfiles', 'version', 'elements', 'safeArea', 'bleed', 'groups', 'layoutVariants'];
  if (Object.keys(input).some((key) => !rootKeys.includes(key))) fail('DesignDocument v2 contains an unsupported field');
  const variants = input.layoutVariants;
  const canvas = input.canvas;
  if (!isObject(canvas) || canvas.unit !== 'px' || !Number.isFinite(canvas.width) || !Number.isFinite(canvas.height) || canvas.width < 320 || canvas.width > 4000 || canvas.height < 320 || canvas.height > 4000) fail('Logical canvas is invalid');
  if (!Array.isArray(input.elements) || input.elements.length < 1 || input.elements.length > 100) fail('Design elements are invalid');
  if (input.metadata?.editorialFields !== undefined) {
    const fields = input.metadata.editorialFields;
    if (!Array.isArray(fields) || fields.length > 10 || new Set(fields.map(field => field?.elementId)).size !== fields.length) fail('Editorial declarations are invalid');
    for (const field of fields) if (!isObject(field) || Object.keys(field).some(key => !['elementId', 'binding'].includes(key)) || field.binding !== 'event.invitationText' || !input.elements.some(element => element?.id === field.elementId && element.type === 'TEXT' && element.binding === field.binding)) fail('Editorial declaration targets a structured or missing field');
  }
  if (input.metadata?.editorialOverrides !== undefined) {
    if (!isObject(input.metadata.editorialOverrides)) fail('Editorial selections are invalid');
    for (const [elementId, selection] of Object.entries(input.metadata.editorialOverrides)) {
      if (!input.metadata.editorialFields?.some(field => field.elementId === elementId) || !isObject(selection) || Object.keys(selection).some(key => !['selectedText', 'sourceText', 'sourceVersion', 'jobId', 'origin'].includes(key)) || typeof selection.selectedText !== 'string' || !selection.selectedText.trim() || selection.selectedText.length > 12000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001f\u007f]/.test(selection.selectedText) || typeof selection.sourceText !== 'string' || selection.sourceText.length > 12000 || !Number.isInteger(selection.sourceVersion) || selection.sourceVersion < 1 || !['MANUAL', 'AI_ASSISTED'].includes(selection.origin)) fail('Editorial selection contains invalid provenance');
    }
  }
  const ids = new Set();
  for (const element of input.elements) {
    if (!isObject(element) || typeof element.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(element.id) || ids.has(element.id)) fail('Design element id is invalid or duplicated');
    const elementKeys = ['id', 'type', 'name', 'x', 'y', 'width', 'height', 'rotation', 'locked', 'editable', 'zIndex', 'fill', 'shape', 'stroke', 'strokeWidth', 'text', 'fontFamily', 'fontSize', 'fontWeight', 'align', 'color', 'source', 'assetId', 'originalAssetId', 'derivedAssetId', 'sourceWidth', 'sourceHeight', 'fit', 'cropX', 'cropY', 'cropScale', 'opacity', 'role', 'minFontSize', 'maxFontSize', 'maxLines', 'lineHeight', 'overflowPolicy', 'hideWhenEmpty', 'collapseSpace', 'minSize', 'maxSize', 'quietZone', 'binding', 'fontId', 'preferredFontSize', 'visibility', 'groupId', 'maskId', 'paddingX', 'focalPoint', 'blur', 'overlay'];
    if (Object.keys(element).some((key) => !elementKeys.includes(key))) fail(`Design element ${element.id} contains an unsupported field`);
    ids.add(element.id);
    if (!['BACKGROUND', 'TEXT', 'SHAPE', 'IMAGE', 'QR'].includes(element.type)) fail('Design element type is not supported');
    for (const field of ['x', 'y', 'width', 'height']) if (!Number.isFinite(element[field])) fail(`Element ${field} must be finite`);
    if (element.x < 0 || element.y < 0 || element.width <= 0 || element.height <= 0 || element.x + element.width > canvas.width || element.y + element.height > canvas.height) fail('Design element exceeds logical canvas');
    if (element.binding !== undefined && !safeBinding(element.binding)) fail(`Binding is not allowed: ${String(element.binding)}`);
    if (element.binding === 'qr' && element.type !== 'QR' || element.binding === 'qr.url' && element.type !== 'TEXT') fail(`Binding ${element.binding} cannot be used by ${element.type}`);
    if (element.type === 'TEXT') {
      if (typeof element.text !== 'string' || element.text.length > 500 || !own(FONT_REGISTRY, element.fontId) || !Number.isFinite(element.preferredFontSize) || !Number.isFinite(element.minFontSize) || element.minFontSize < 8 || element.preferredFontSize < element.minFontSize || element.preferredFontSize > 180 || !['ERROR', 'SHRINK_WITH_LIMIT', 'USE_VARIANT', 'AI_ASSIST_ALLOWED'].includes(element.overflowPolicy)) fail(`Text element ${element.id} typography is invalid`);
    }
    validateVisibility(element.visibility);
    validateVisualProperties(element);
  }
  const elementById = new Map(input.elements.map((element) => [element.id, element]));
  if (!Array.isArray(input.groups) || input.groups.length > 10) fail('Repeat groups are invalid');
  const groupIds = new Set();
  const groupedElementIds = new Set();
  for (const group of input.groups) {
    if (groupIds.has(group?.id)) fail('Repeat group ids must be unique');
    groupIds.add(group?.id);
    validateGroup(group, elementById, canvas);
    for (const elementId of group.elementIds) { if (groupedElementIds.has(elementId)) fail('A repeat element can belong to only one group'); groupedElementIds.add(elementId); }
  }
  for (const element of input.elements) if (element.groupId !== undefined && (!groupIds.has(element.groupId) || !input.groups.find((group) => group.id === element.groupId)?.elementIds.includes(element.id))) fail('Element repeat group is invalid');
  if (!Array.isArray(variants) || variants.length < 5 || variants.length > 6) fail('All ceremony layout variants must be defined');
  const requiredVariants = ['noCeremony', 'singleCeremony', 'twoCeremonies', 'threeCeremonies', 'multiCeremony'];
  for (const id of requiredVariants) if (!variants.some((variant) => variant?.id === id)) fail(`Missing layout variant ${id}`);
  const variantIds = new Set();
  for (const variant of variants) {
    if (!isObject(variant) || Object.keys(variant).some((key) => !['id', 'when', 'overrides', 'groupLayouts'].includes(key)) || typeof variant.id !== 'string' || !/^[a-z][a-zA-Z0-9-]{0,59}$/.test(variant.id) || variantIds.has(variant.id)) fail('Layout variant is invalid or duplicated');
    variantIds.add(variant.id);
    const when = variant.when;
    if (!isObject(when) || Object.keys(when).some((key) => !['type', 'operator', 'value'].includes(key)) || when.type !== 'ceremony-count' || !['eq', 'gte'].includes(when.operator) || !Number.isInteger(when.value) || when.value < 0 || when.value > 100) fail('Layout variant condition is invalid');
    if (!Array.isArray(variant.overrides ?? []) || !Array.isArray(variant.groupLayouts ?? [])) fail('Layout variant overrides are invalid');
    for (const override of variant.overrides ?? []) {
      if (!isObject(override) || Object.keys(override).some((key) => !['elementId', 'visible', 'bounds'].includes(key)) || !elementById.has(override.elementId) || override.visible !== undefined && typeof override.visible !== 'boolean') fail('Layout variant element override is invalid');
      if (override.bounds) { const bounds = rect(override.bounds, 'variant override'); if (bounds.x + bounds.width > canvas.width || bounds.y + bounds.height > canvas.height) fail('Layout variant override exceeds canvas'); }
    }
    for (const layout of variant.groupLayouts ?? []) {
      if (!isObject(layout) || Object.keys(layout).some((key) => !['groupId', 'bounds', 'columns', 'direction', 'gap'].includes(key)) || !input.groups.some((group) => group.id === layout.groupId)) fail('Layout variant group layout is invalid');
      const bounds = rect(layout.bounds, 'variant group layout');
      if (bounds.x + bounds.width > canvas.width || bounds.y + bounds.height > canvas.height || !Number.isInteger(layout.columns) || layout.columns < 1 || layout.columns > 4 || !['vertical', 'horizontal'].includes(layout.direction) || !Number.isFinite(layout.gap) || layout.gap < 0 || layout.gap > 1000) fail('Layout variant group bounds are invalid');
    }
  }
  const idsByVariant = variants.map((variant) => variant.id);
  if (idsByVariant.includes('noCeremony') && !variants.some((variant) => variant.id === 'noCeremony' && variant.when.value === 0 && variant.when.operator === 'eq')) fail('noCeremony variant must explicitly match zero ceremonies');
  validateEdges(input.safeArea, 'safeArea', Math.min(canvas.width, canvas.height) / 4);
  validateEdges(input.bleed, 'bleed', Math.max(canvas.width, canvas.height));
  return input;
}

function safeSnapshot(snapshot) {
  if (!isObject(snapshot)) fail('Authorized render snapshot is required');
  const project = (obj, keys) => Object.fromEntries(keys.map((key) => [key, stringOrEmpty(obj?.[key])]).filter(([, value]) => value !== ''));
  const ceremonies = Array.isArray(snapshot.ceremonies) ? snapshot.ceremonies.map((ceremony) => project(ceremony, ['name', 'date', 'time', 'venue', 'address', 'reference', 'dressCode'])) : [];
  return {
    guest: project(snapshot.guest, ['name', 'email']),
    table: project(snapshot.table, ['name']),
    event: project(snapshot.event, ['title', 'coupleNames', 'invitationText', 'date', 'venue']),
    ceremonies,
    contact: project(snapshot.contact, ['value']),
    qr: { available: snapshot.qr?.available === true, url: safeHttpUrl(snapshot.qr?.url) },
    variables: isObject(snapshot.variables) ? Object.fromEntries(Object.entries(snapshot.variables).filter(([key, value]) => /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(key) && typeof value === 'string').map(([key, value]) => [key, value.slice(0, 2000)])) : {},
  };
}

function safeHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 512) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.toString() : '';
  } catch { return ''; }
}

function resolveBinding(binding, data, ceremony = null) {
  if (binding === 'guest.name') return data.guest.name ?? '';
  if (binding === 'guest.email') return data.guest.email ?? '';
  if (binding === 'guest.table') return data.table.name ?? '';
  if (binding === 'event.title') return data.event.title ?? '';
  if (binding === 'event.coupleNames') return data.event.coupleNames ?? '';
  if (binding === 'event.invitationText') return data.event.invitationText ?? '';
  if (binding === 'event.date') return data.event.date ?? '';
  if (binding === 'event.venue') return data.event.venue ?? '';
  if (binding === 'contact') return data.contact.value ?? '';
  if (binding === 'qr') return data.qr.available ? 'qr' : '';
  if (binding === 'qr.url') return data.qr.available ? data.qr.url ?? '' : '';
  if (binding === 'ceremonies') return data.ceremonies.map((entry) => entry.name ?? '').filter(Boolean).join(' · ');
  return ceremony ? stringOrEmpty(ceremony[binding.slice('ceremony.'.length)]) : '';
}

function conditionMatches(condition, count) { return condition.operator === 'eq' ? count === condition.value : count >= condition.value; }

function selectVariant(document, ceremonyCount, explicitId) {
  const variants = document.layoutVariants ?? [];
  if (explicitId) {
    const selected = variants.find((variant) => variant.id === explicitId);
    if (!selected || !conditionMatches(selected.when, ceremonyCount)) fail('Selected layout variant does not match the ceremony count');
    return selected;
  }
  const matches = variants.filter((variant) => conditionMatches(variant.when, ceremonyCount)).sort((a, b) => (a.when.operator === 'eq' ? 0 : 1) - (b.when.operator === 'eq' ? 0 : 1));
  if (matches.length !== 1) fail(ceremonyCount === 0 ? 'No explicit zero-ceremony layout variant is available' : 'No unique layout variant matches the ceremony count');
  return matches[0];
}

function conditionVisible(rule, data) {
  if (!rule) return true;
  if (rule.type === 'binding-exists') return rule.binding === 'qr' ? data.qr.available : Boolean(resolveBinding(rule.binding, data));
  if (rule.type === 'ceremony-count') return rule.operator === 'eq' ? data.ceremonies.length === rule.value : data.ceremonies.length >= rule.value;
  return false;
}

function bindingValues(data, ceremony) {
  return {
    ...data.variables,
    guest_name: data.guest.name ?? '', guestname: data.guest.name ?? '', guest_full_name: data.guest.name ?? '',
    guest_email: data.guest.email ?? '', table_name: data.table.name ?? '', tablename: data.table.name ?? '', tableName: data.table.name ?? '',
    event_name: data.event.title ?? '', eventname: data.event.title ?? '', event_date: data.event.date ?? '', event_location: data.event.venue ?? '',
    ceremony_name: data.ceremonies.map((entry) => entry.name ?? '').filter(Boolean).join(' · '), qr_code: data.qr.available ? data.qr.url ?? '' : '', rsvp_link: data.qr.available ? data.qr.url ?? '' : '',
    ...(ceremony ? { ceremony_name: ceremony.name ?? '', ceremony_date: ceremony.date ?? '', ceremony_time: ceremony.time ?? '', ceremony_venue: ceremony.venue ?? '', ceremony_address: ceremony.address ?? '', ceremony_reference: ceremony.reference ?? '', ceremony_dress_code: ceremony.dressCode ?? '' } : {}),
  };
}

function resolveText(layer, data, ceremony) {
  if (safeBinding(layer.binding)) return resolveBinding(layer.binding, data, ceremony);
  const values = bindingValues(data, ceremony);
  const variables = { ...values };
  return stringOrEmpty(layer.text).replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_match, key) => {
    if (own(variables, key)) return variables[key];
    if (own(variables, key.toLowerCase())) return variables[key.toLowerCase()];
    const declared = (Array.isArray(layer.documentVariables) ? layer.documentVariables : []).find((item) => item?.key === key);
    return stringOrEmpty(declared?.defaultValue);
  });
}

function layoutItems(group, variant, count) {
  const configured = variant.groupLayouts?.find((entry) => entry.groupId === group.id);
  const bounds = configured?.bounds ?? group.bounds;
  const columns = configured?.columns ?? group.columns ?? 1;
  const gap = configured?.gap ?? group.gap ?? 0;
  const rows = Math.ceil(count / columns);
  const itemWidth = (bounds.width - gap * Math.max(0, columns - 1)) / columns;
  const itemHeight = (bounds.height - gap * Math.max(0, rows - 1)) / rows;
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return { x: bounds.x + column * (itemWidth + gap), y: bounds.y + row * (itemHeight + gap), width: itemWidth, height: itemHeight };
  });
}

function resolveFont(layer) {
  const id = typeof layer.fontId === 'string' && own(FONT_REGISTRY, layer.fontId) ? layer.fontId : fontIdForFamily(layer.fontFamily);
  return FONT_REGISTRY[id];
}

function estimatedWidth(text, fontSize, letterSpacing = 0) {
  return [...text].reduce((sum, char) => sum + fontSize * (/[MW@#%]/u.test(char) ? 0.82 : /[il.,' ]/u.test(char) ? 0.3 : 0.56), 0) + Math.max(0, [...text].length - 1) * letterSpacing;
}
function wrapText(text, width, fontSize, letterSpacing = 0) {
  const result = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    let line = '';
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && estimatedWidth(candidate, fontSize, letterSpacing) > width) { result.push(line); line = word; } else line = candidate;
      if (estimatedWidth(line, fontSize, letterSpacing) > width) {
        const chars = [...line]; let part = '';
        for (const char of chars) { if (part && estimatedWidth(part + char, fontSize, letterSpacing) > width) { result.push(part); part = char; } else part += char; }
        line = part;
      }
    }
    result.push(line);
  }
  return result.length ? result : [''];
}

export function fitInvitationText(layer, text) {
  const width = Math.max(1, finite(layer.width, 1) - Math.max(0, finite(layer.paddingX, 0)) * 2);
  const height = Math.max(1, finite(layer.height, 1));
  const preferred = Math.max(8, Math.min(180, finite(layer.preferredFontSize, finite(layer.maxFontSize, finite(layer.fontSize, 36)))));
  const minimum = Math.max(8, Math.min(preferred, finite(layer.minFontSize, preferred)));
  const maxLines = Math.max(1, Math.min(30, finite(layer.maxLines, 4)));
  const lineHeight = Math.max(0.85, Math.min(2, finite(layer.lineHeight, 1.2)));
  const letterSpacing = Math.max(-2, Math.min(20, finite(layer.letterSpacing, 0)));
  const policy = layer.overflowPolicy ?? 'SHRINK_WITH_LIMIT';
  const canShrink = policy === 'SHRINK_WITH_LIMIT' || policy === 'AI_ASSIST_ALLOWED' || policy === 'USE_VARIANT' || policy === 'ERROR' && layer.sourceSchemaVersion === 1;
  const nameNeedsFit = /guest|invite|invité/i.test(String(layer.role ?? layer.name ?? '')) && [...text].length > 48;
  const start = canShrink ? preferred : minimum;
  const stop = canShrink ? minimum : start;
  for (let size = start; size >= stop; size -= 1) {
    const lines = wrapText(text, width, size, letterSpacing);
    if (lines.length <= maxLines && lines.length * size * lineHeight <= height && (!nameNeedsFit || size < preferred)) return { fontSize: size, lines, lineHeight, reduced: size < preferred, overflow: false };
  }
  return { fontSize: stop, lines: wrapText(text, width, stop, letterSpacing), lineHeight, reduced: stop < preferred, overflow: true };
}

function withinCanvas(element, canvas) { return element.x >= 0 && element.y >= 0 && element.x + element.width <= canvas.width && element.y + element.height <= canvas.height; }
function withinSafeArea(element, safeArea) { return element.x >= safeArea.left && element.y >= safeArea.top && element.x + element.width <= element.canvasWidth - safeArea.right && element.y + element.height <= element.canvasHeight - safeArea.bottom; }

export function resolveDesignLayout(input, rawSnapshot, selectedVariantId, assets, target = { mode: 'print', widthMm: 148, heightMm: 210 }) {
  const sourceSchemaVersion = isObject(input) ? input.schemaVersion : undefined;
  const document = normalizeDesignDocumentV2(input);
  if (sourceSchemaVersion === 2) validateDesignDocumentV2(document);
  const snapshot = safeSnapshot(rawSnapshot);
    const variant = selectVariant(document, snapshot.ceremonies.length, selectedVariantId);
  const canvas = document.canvas;
  const safeArea = safeEdges(document.safeArea ?? document.constraints?.safeMargin, 64);
  const bleed = safeEdges(document.bleed, 0);
  const errors = [];
  if (target.mode === 'print' && document.metadata?.personalization?.policy === 'professional-v1' && document.metadata.mediaStrategy !== 'NO_PHOTO' && document.metadata.photoRequired !== false) {
    for (const slot of document.metadata.photoSlots ?? []) if (slot.required === true && !document.elements.some((element) => element.id === slot.elementId && element.type === 'IMAGE')) {
      errors.push({ code: 'PHOTO_SLOT_REQUIRED', elementId: slot.elementId, message: 'Ajoutez la photo principale avant la génération finale.' });
    }
  }
  const warnings = [];
  const elements = [];
  const overrides = new Map((variant.overrides ?? []).map((entry) => [entry.elementId, entry]));
  const groupByElement = new Map();
  for (const group of document.groups ?? []) for (const elementId of group.elementIds) groupByElement.set(elementId, group);
  const appendElement = (sourceElement, ceremony, repetitionIndex) => {
    const layer = { ...sourceElement, sourceSchemaVersion };
    const override = overrides.get(layer.id);
    if (override?.bounds) Object.assign(layer, override.bounds);
    const visible = override?.visible ?? conditionVisible(layer.visibility, snapshot);
    if (!visible) return;
    let resolvedText;
    if (layer.type === 'TEXT') {
      resolvedText = resolveText(layer, { ...snapshot, variables: { ...(Array.isArray(document.variables) ? Object.fromEntries(document.variables.filter((item) => typeof item?.key === 'string').map((item) => [item.key, stringOrEmpty(rawSnapshot.variables?.[item.key] ?? item.defaultValue)])) : {}), ...snapshot.variables } }, ceremony);
      const editorial = document.metadata?.editorialOverrides?.[layer.id];
      if (editorial && document.metadata?.editorialFields?.some(field => field.elementId === layer.id && field.binding === layer.binding && field.binding === 'event.invitationText') && typeof editorial.selectedText === 'string') resolvedText = editorial.selectedText;
      if (!resolvedText.trim() && (layer.hideWhenEmpty || layer.binding)) return;
    }
    const font = layer.type === 'TEXT' ? resolveFont(layer) : undefined;
    const requestedWeight = finite(layer.fontWeight, 400);
    const resolved = { ...layer, visible: true, ...(resolvedText !== undefined ? { resolvedText } : {}), ...(ceremony ? { repeatIndex: repetitionIndex } : {}), ...(font ? { resolvedFont: font, resolvedFontWeight: font.weights.reduce((best, weight) => Math.abs(weight - requestedWeight) < Math.abs(best - requestedWeight) ? weight : best, font.weights[0]), resolvedFontStyle: font.styles.includes(layer.fontStyle) ? layer.fontStyle : 'normal' } : {}), ...(layer.type === 'IMAGE' ? { resolvedAsset: { assetId: typeof layer.assetId === 'string' ? layer.assetId : null, href: typeof assets?.[layer.assetId] === 'string' ? assets[layer.assetId] : null } } : {}) };
    if (!withinCanvas(resolved, canvas)) errors.push({ code: 'OUTSIDE_CANVAS', elementId: resolved.id, message: 'Un élément dépasse le canevas logique.' });
    if ((resolved.type === 'TEXT' && (sourceSchemaVersion === 2 || ['GUEST_NAME', 'TABLE_INFO', 'EVENT_TITLE', 'COUPLE_NAMES'].includes(String(resolved.role))) || resolved.type === 'QR' && sourceSchemaVersion === 2) && !withinSafeArea({ ...resolved, canvasWidth: canvas.width, canvasHeight: canvas.height }, safeArea)) errors.push({ code: 'OUTSIDE_SAFE_AREA', elementId: resolved.id, message: 'Un contenu essentiel dépasse la zone de sécurité.' });
    if (resolved.type === 'IMAGE') {
      resolved.resolvedQuality = assessImageResolution(resolved, canvas, target);
      if (sourceSchemaVersion === 2 && resolved.resolvedQuality.status !== 'OK') (resolved.resolvedQuality.status === 'ERROR' ? errors : warnings).push({ code: resolved.resolvedQuality.code, elementId: resolved.id, message: 'La définition de cette image est insuffisante ou inconnue pour le format impression.', effectiveDpi: resolved.resolvedQuality.effectiveDpi });
      if (assets !== undefined && !assets[layer.assetId]) errors.push({ code: 'ASSET_UNAVAILABLE', elementId: resolved.id, message: 'Le média privé n’est pas disponible.' });
    }
    if (resolved.type === 'TEXT') {
      const fit = fitInvitationText(resolved, resolvedText);
      resolved.resolvedFontSize = fit.fontSize;
      resolved.resolvedLineHeight = fit.lineHeight;
      resolved.resolvedLines = fit.lines;
      if (fit.reduced) warnings.push({ code: 'FONT_REDUCED', elementId: resolved.id, message: 'La taille a été réduite dans la limite configurée.' });
      const assistanceEligible = resolved.overflowPolicy === 'AI_ASSIST_ALLOWED' && document.metadata?.editorialFields?.some(field => field.elementId === resolved.id && field.binding === resolved.binding && field.binding === 'event.invitationText') === true;
      if (fit.overflow) errors.push({ code: assistanceEligible ? 'TEXT_OVERFLOW_ASSISTANCE_AVAILABLE' : resolved.overflowPolicy === 'USE_VARIANT' ? 'TEXT_OVERFLOW_VARIANT_REQUIRED' : 'TEXT_OVERFLOW', elementId: resolved.id, message: 'Le texte ne tient pas dans la zone du modèle.', assistanceEligible });
    }
    elements.push(resolved);
  };
  const groups = [];
  const repeatedElementIds = new Set();
  for (const group of document.groups ?? []) {
    const items = layoutItems(group, variant, snapshot.ceremonies.length);
    const groupItems = [];
    items.forEach((bounds, index) => {
      const ceremony = snapshot.ceremonies[index];
      groupItems.push({ index, ceremony, bounds });
      const scaleX = bounds.width / group.bounds.width;
      const scaleY = bounds.height / group.bounds.height;
      for (const elementId of group.elementIds) {
        const child = document.elements.find((entry) => entry.id === elementId);
        if (!child) continue;
        repeatedElementIds.add(child.id);
        const clone = { ...child, id: `${child.id}--${group.id}-${index + 1}`, sourceElementId: child.id, x: bounds.x + (child.x - group.bounds.x) * scaleX, y: bounds.y + (child.y - group.bounds.y) * scaleY, width: child.width * scaleX, height: child.height * scaleY };
        appendElement(clone, ceremony, index);
      }
    });
    groups.push({ id: group.id, layoutSlot: group.layoutSlot, items: groupItems });
  }
  for (const element of document.elements) if (!repeatedElementIds.has(element.id)) appendElement(element, null, null);
  elements.sort((a, b) => finite(a.zIndex) - finite(b.zIndex) || document.elements.findIndex((e) => e.id === (a.sourceElementId ?? a.id)) - document.elements.findIndex((e) => e.id === (b.sourceElementId ?? b.id)) || finite(a.repeatIndex, -1) - finite(b.repeatIndex, -1));
  if (sourceSchemaVersion === 2) errors.push(...visualOcclusionIssues(elements));
  return { schemaVersion: document.schemaVersion, variantId: variant.id, canvas: { ...canvas }, safeArea, bleed, elements, groups, warnings, errors };
}

export function scaleLogicalBounds(bounds, canvas, viewport) {
  const transform = logicalCanvasTransform(canvas, viewport);
  return { x: bounds.x * transform.scale + transform.offsetX, y: bounds.y * transform.scale + transform.offsetY, width: bounds.width * transform.scale, height: bounds.height * transform.scale };
}

export function logicalCanvasTransform(canvas, viewport) {
  const scale = Math.min(viewport.width / canvas.width, viewport.height / canvas.height);
  return { scale, offsetX: (viewport.width - canvas.width * scale) / 2, offsetY: (viewport.height - canvas.height * scale) / 2 };
}

const svgEscape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
/** Serialize an already-resolved tree. Assets and QR hrefs are supplied by the caller; this function performs no I/O. */
export function renderResolvedLayoutSvg(layout, { assets = {}, qrHref = '', fragment = false } = {}) {
  const { width, height } = layout.canvas;
  const parts = [];
  for (const layer of layout.elements) {
    const x = finite(layer.x), y = finite(layer.y), w = finite(layer.width), h = finite(layer.height), rotation = finite(layer.rotation);
    const transform = rotation ? ` transform="rotate(${rotation} ${x + w / 2} ${y + h / 2})"` : '';
    if (layer.type === 'QR') {
      parts.push(`<g${transform}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${qrHref ? `<image href="${svgEscape(qrHref)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/>` : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#777" stroke-dasharray="8 6"/>`}</g>`);
    } else if (layer.type === 'IMAGE') {
      const href = assets[layer.assetId] ?? layer.resolvedAsset?.href ?? '';
      if (href) {
        parts.push(renderVisualImageSvg(layer, href));
      }
    } else if (layer.type === 'BACKGROUND' || layer.type === 'SHAPE') {
      parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${svgEscape(layer.fill === 'transparent' ? 'none' : layer.fill ?? 'none')}" stroke="${svgEscape(layer.stroke ?? 'none')}" stroke-width="${finite(layer.strokeWidth)}" opacity="${Math.max(0, Math.min(1, finite(layer.opacity, 1)))}"${transform}/>`);
      if (layer.overlay) parts.push(`<g${transform} opacity="${finite(layer.opacity, 1)}">${renderOverlaySvg(layer.overlay, layer, `visual-${layer.id}`)}</g>`);
    } else if (layer.type === 'TEXT') {
      const font = layer.resolvedFont ?? resolveFont(layer), size = finite(layer.resolvedFontSize, finite(layer.fontSize, 16)), lines = Array.isArray(layer.resolvedLines) ? layer.resolvedLines : [stringOrEmpty(layer.resolvedText)];
      const align = layer.align === 'left' ? 'start' : layer.align === 'right' ? 'end' : 'middle', tx = layer.align === 'left' ? x : layer.align === 'right' ? x + w : x + w / 2;
      const lineHeight = finite(layer.resolvedLineHeight, finite(layer.lineHeight, 1.2)), firstY = y + h / 2 - (lines.length - 1) * size * lineHeight / 2;
      parts.push(`<text x="${tx}" y="${firstY}" text-anchor="${align}" dominant-baseline="middle" font-family="${svgEscape(`${font.family}, ${font.fallback}`)}" font-size="${size}" font-weight="${finite(layer.resolvedFontWeight, finite(layer.fontWeight, 400))}" font-style="${svgEscape(layer.resolvedFontStyle ?? layer.fontStyle ?? 'normal')}" letter-spacing="${finite(layer.letterSpacing)}" fill="${svgEscape(layer.color ?? '#29251f')}" opacity="${Math.max(0, Math.min(1, finite(layer.opacity, 1)))}"${transform}>${lines.map((line, index) => `<tspan x="${tx}" dy="${index ? size * lineHeight : 0}">${svgEscape(line)}</tspan>`).join('')}</text>`);
    }
  }
  return fragment ? parts.join('') : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" role="img">${parts.join('')}</svg>`;
}
