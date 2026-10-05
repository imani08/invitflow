import { BadRequestException } from '@nestjs/common';
import { normalizeDesignDocumentV2, validateDesignDocumentV2 } from '@invitaflow/design-document';

export type DesignDocument = Record<string, unknown> & {
  schemaVersion: 1 | 2;
  canvas: { width: number; height: number; unit: 'px' };
  theme: Record<string, unknown>;
  assets: unknown[];
  variables: Record<string, unknown>[];
  constraints: Record<string, unknown>;
  layouts: Record<string, unknown>[];
  ceremonyRules: Record<string, unknown>[];
  exportProfiles: Record<string, unknown>[];
  elements: Record<string, unknown>[];
  version: number;
};

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function fail(message: string): never { throw new BadRequestException(message); }
function entries(value: unknown, field: string, minimum = 0, maximum = 200): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum || value.some((entry) => !object(entry))) fail(`${field} doit contenir de ${minimum} à ${maximum} objets.`);
  return value as Record<string, unknown>[];
}
function scalar(value: unknown, field: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) fail(`${field} est invalide.`);
  return value;
}
function number(value: unknown, field: string, minimum: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) fail(`${field} est hors limites.`);
  return value;
}
function color(value: unknown, field: string, transparent = false) {
  if (transparent && value === 'transparent') return value;
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) fail(`${field} doit être une couleur hexadécimale.`);
  return value;
}
function onlyKeys(value: Record<string, unknown>, allowed: string[], field: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail(`${field} contient un champ non pris en charge.`);
}

const fallbackPalette = ['#F5F0E8', '#32163A', '#BD8742'];
const categoriesAllowed = new Set(['WEDDING', 'BIRTHDAY', 'GRADUATION', 'BAPTISM', 'BABY_SHOWER', 'GALA', 'CONFERENCE']);
const safeColor = (value: unknown, fallback: string) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
const safeNumber = (value: unknown, fallback: number, minimum: number, maximum: number) => typeof value === 'number' && Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;

/** Fill gaps from earlier persisted documents before the strict current schema is applied. */
function normalizeLegacyDesignDocument(value: unknown): DesignDocument {
  const source = object(value) ? value : {};
  const sourceCanvas = object(source['canvas']) ? source['canvas'] : {};
  const width = safeNumber(sourceCanvas['width'], 1080, 320, 4000);
  const height = safeNumber(sourceCanvas['height'], 1920, 320, 4000);
  const sourceTheme = object(source['theme']) ? source['theme'] : {};
  const rawTokens = object(sourceTheme['tokens']) ? sourceTheme['tokens'] : {};
  const category = typeof sourceTheme['category'] === 'string' && categoriesAllowed.has(sourceTheme['category']) ? sourceTheme['category'] : 'WEDDING';
  const style = typeof sourceTheme['style'] === 'string' && sourceTheme['style'].trim() ? sourceTheme['style'].slice(0, 60) : 'CLASSIC';
  const background = safeColor(rawTokens['background'], fallbackPalette[0]!);
  const primary = safeColor(rawTokens['primary'], fallbackPalette[1]!);
  const secondary = safeColor(rawTokens['secondary'], fallbackPalette[2]!);
  const font = typeof rawTokens['font'] === 'string' && rawTokens['font'].trim() ? rawTokens['font'].slice(0, 80) : 'Georgia';
  const rawVariables = Array.isArray(source['variables']) ? source['variables'] : [];
  const variables: Record<string, unknown>[] = [];
  const variableKeys = new Set<string>();
  for (const [index, item] of rawVariables.entries()) {
    if (!object(item)) continue;
    let key = typeof item['key'] === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(item['key']) ? item['key'] : `legacyVariable${index + 1}`;
    if (variableKeys.has(key)) key = `legacyVariable${index + 1}`;
    if (variableKeys.has(key)) continue;
    variableKeys.add(key);
    const required = item['required'] === true;
    const defaultValue = typeof item['defaultValue'] === 'string' ? item['defaultValue'].slice(0, 500) : '';
    variables.push({ key, label: typeof item['label'] === 'string' && item['label'].trim() ? item['label'].slice(0, 100) : key, type: 'TEXT', defaultValue: required && !defaultValue.trim() ? key : defaultValue, required });
  }
  if (!variables.length) variables.push({ key: 'coupleNames', label: 'Noms ou titre', type: 'TEXT', defaultValue: 'Votre événement', required: true });
  for (const [key, label, value] of [['guest_name', 'Nom de l’invité', 'Nom de l’invité'], ['table_name', 'Nom de table', ''], ['event_name', 'Nom de l’événement', ''], ['ceremony_name', 'Nom de la cérémonie', ''], ['event_date', 'Date de l’événement', ''], ['event_location', 'Lieu de l’événement', ''], ['rsvp_link', 'Lien RSVP', ''], ['qr_code', 'QR privé', '']] as const) {
    if (!variables.some((variable) => variable['key'] === key)) variables.push({ key, label, type: 'TEXT', defaultValue: value, required: false });
  }
  const rawElements = Array.isArray(source['elements']) ? source['elements'] : [];
  const elements: Record<string, unknown>[] = [];
  const elementIds = new Set<string>();
  const nextLayerId = (base: string) => {
    let id = base;
    let suffix = 1;
    while (elementIds.has(id)) id = `${base}-${suffix++}`;
    elementIds.add(id);
    return id;
  };
  for (const [index, raw] of rawElements.slice(0, 97).entries()) {
    if (!object(raw) || !['BACKGROUND', 'TEXT', 'SHAPE', 'IMAGE', 'QR'].includes(String(raw['type']))) continue;
    const type = raw['type'] as string;
    const x = type === 'BACKGROUND' ? 0 : safeNumber(raw['x'], 80, 0, width - 1);
    const y = type === 'BACKGROUND' ? 0 : safeNumber(raw['y'], 80, 0, height - 1);
    const layerWidth = type === 'BACKGROUND' ? width : safeNumber(raw['width'], Math.min(width - x, 920), 1, width - x);
    const layerHeight = type === 'BACKGROUND' ? height : safeNumber(raw['height'], Math.min(height - y, 160), 1, height - y);
    let id = typeof raw['id'] === 'string' && /^[a-zA-Z0-9_-]+$/.test(raw['id']) ? raw['id'] : `legacy-layer-${index + 1}`;
    if (elementIds.has(id)) id = `legacy-layer-${index + 1}`;
    if (elementIds.has(id)) continue;
    elementIds.add(id);
    const common = { id, type, name: typeof raw['name'] === 'string' && raw['name'].trim() ? raw['name'].slice(0, 100) : `Calque ${index + 1}`, x, y, width: layerWidth, height: layerHeight, rotation: safeNumber(raw['rotation'], 0, -360, 360), locked: type === 'BACKGROUND' || raw['locked'] === true, editable: type !== 'BACKGROUND' && raw['editable'] !== false, zIndex: safeNumber(raw['zIndex'], index, 0, 10000) };
    if (type === 'BACKGROUND') elements.push({ ...common, locked: true, editable: false, fill: safeColor(raw['fill'], background) });
    else if (type === 'SHAPE') elements.push({ ...common, shape: 'RECTANGLE', fill: raw['fill'] === 'transparent' ? 'transparent' : safeColor(raw['fill'], 'transparent'), stroke: safeColor(raw['stroke'], primary), strokeWidth: safeNumber(raw['strokeWidth'], 0, 0, 24) });
    else if (type === 'IMAGE') {
      if (typeof raw['assetId'] !== 'string' || !/^[0-9a-f-]{36}$/i.test(raw['assetId'])) continue;
      elements.push({ ...common, assetId: raw['assetId'], ...(typeof raw['originalAssetId'] === 'string' ? { originalAssetId: raw['originalAssetId'] } : {}), ...(typeof raw['derivedAssetId'] === 'string' ? { derivedAssetId: raw['derivedAssetId'] } : {}), sourceWidth: safeNumber(raw['sourceWidth'], 1, 1, 8192), sourceHeight: safeNumber(raw['sourceHeight'], 1, 1, 8192), fit: raw['fit'] === 'contain' ? 'contain' : 'cover', cropX: safeNumber(raw['cropX'], 50, 0, 100), cropY: safeNumber(raw['cropY'], 50, 0, 100), cropScale: safeNumber(raw['cropScale'], 1, 1, 3), opacity: safeNumber(raw['opacity'], 1, 0, 1) });
    }
    else if (type === 'QR') elements.push({ ...common, source: 'guest_access_token', minSize: safeNumber(raw['minSize'], 96, 64, 256), maxSize: safeNumber(raw['maxSize'], 256, 96, 512), quietZone: safeNumber(raw['quietZone'], 4, 2, 8) });
    else {
      const text = typeof raw['text'] === 'string' ? raw['text'].slice(0, 500) : '';
      const fontSize = safeNumber(raw['fontSize'], 36, 8, 180);
      const role = typeof raw['role'] === 'string' ? raw['role'] : /guest_name|guest\.name/i.test(text) ? 'GUEST_NAME' : /table_name/i.test(text) ? 'TABLE_INFO' : /event_name/i.test(text) ? 'EVENT_TITLE' : /ceremony/i.test(text) ? 'CEREMONY_INFO' : 'BODY';
      elements.push({ ...common, text, role, fontFamily: typeof raw['fontFamily'] === 'string' ? raw['fontFamily'].slice(0, 80) : font, fontSize, minFontSize: safeNumber(raw['minFontSize'], Math.max(8, Math.round(fontSize * 0.55)), 8, 180), maxFontSize: safeNumber(raw['maxFontSize'], fontSize, 8, 180), maxLines: safeNumber(raw['maxLines'], 4, 1, 20), lineHeight: safeNumber(raw['lineHeight'], 1.2, 0.85, 2), overflowPolicy: raw['overflowPolicy'] === 'WARN' ? 'WARN' : 'ERROR', hideWhenEmpty: raw['hideWhenEmpty'] === true || /table_name/i.test(text), collapseSpace: raw['collapseSpace'] === true || /table_name/i.test(text), fontWeight: [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(Number(raw['fontWeight'])) ? Number(raw['fontWeight']) : 400, align: ['left', 'center', 'right'].includes(String(raw['align'])) ? raw['align'] : 'center', color: safeColor(raw['color'], primary) });
    }
  }
  if (!elements.length) {
    elements.push({ id: 'normalized-background', type: 'BACKGROUND', name: 'Fond', x: 0, y: 0, width, height, rotation: 0, locked: true, editable: false, zIndex: 0, fill: background });
    elements.push({ id: 'normalized-title', type: 'TEXT', role: 'EVENT_TITLE', name: 'Titre', x: 80, y: Math.round(height * 0.4), width: width - 160, height: 180, rotation: 0, locked: false, editable: true, zIndex: 1, text: `{{${String(variables[0]!['key'])}}}`, fontFamily: font, fontSize: 48, minFontSize: 28, maxFontSize: 48, maxLines: 3, lineHeight: 1.2, overflowPolicy: 'ERROR', hideWhenEmpty: false, collapseSpace: false, fontWeight: 400, align: 'center', color: primary });
  }
  if (!elements.some((element) => element['text'] === '{{guest_name}}')) elements.push({ id: nextLayerId('system-guest-name'), type: 'TEXT', role: 'GUEST_NAME', name: 'Nom de l’invité', x: Math.round(width * 0.1), y: Math.round(height * 0.68), width: Math.round(width * 0.8), height: 120, rotation: 0, locked: false, editable: true, zIndex: Math.max(...elements.map((element) => Number(element['zIndex']) || 0), 0) + 1, text: '{{guest_name}}', fontFamily: font, fontSize: 34, minFontSize: 20, maxFontSize: 34, maxLines: 3, lineHeight: 1.15, overflowPolicy: 'ERROR', hideWhenEmpty: false, collapseSpace: false, fontWeight: 400, align: 'center', color: primary });
  if (!elements.some((element) => element['text'] === '{{table_name}}')) elements.push({ id: nextLayerId('system-table-name'), type: 'TEXT', role: 'TABLE_INFO', name: 'Table de l’invité', x: Math.round(width * 0.1), y: Math.round(height * 0.75), width: Math.round(width * 0.8), height: 70, rotation: 0, locked: false, editable: true, zIndex: Math.max(...elements.map((element) => Number(element['zIndex']) || 0), 0) + 1, text: '{{table_name}}', fontFamily: font, fontSize: 26, minFontSize: 18, maxFontSize: 26, maxLines: 2, lineHeight: 1.15, overflowPolicy: 'ERROR', hideWhenEmpty: true, collapseSpace: true, fontWeight: 400, align: 'center', color: secondary });
  if (!elements.some((element) => element['type'] === 'QR')) {
    const qrSize = Math.min(156, width - 32, height - 32);
    elements.push({ id: nextLayerId('system-guest-qr'), type: 'QR', source: 'guest_access_token', name: 'QR individuel', x: width - qrSize - 48, y: height - qrSize - 48, width: qrSize, height: qrSize, rotation: 0, locked: false, editable: true, zIndex: Math.max(...elements.map((element) => Number(element['zIndex']) || 0), 0) + 1, minSize: 96, maxSize: 256, quietZone: 4 });
  }
  const rawMetadata = object(source['metadata']) ? source['metadata'] : {};
  const rawConstraints = object(source['constraints']) ? source['constraints'] : {};
  const marginValue = rawConstraints['safeMargin'];
  const safeMargin = object(marginValue)
    ? Object.fromEntries(['top', 'right', 'bottom', 'left'].map((edge) => [edge, safeNumber(marginValue[edge], 64, 0, Math.min(width, height) / 4)]))
    : safeNumber(marginValue, 64, 0, Math.min(width, height) / 4);
  const layouts = Array.isArray(source['layouts']) ? source['layouts'].filter(object).slice(0, 12).map((layout, index) => ({ id: typeof layout['id'] === 'string' && layout['id'].trim() ? layout['id'].slice(0, 60) : `layout-${index + 1}`, name: typeof layout['name'] === 'string' && layout['name'].trim() ? layout['name'].slice(0, 100) : `Format ${index + 1}`, width: safeNumber(layout['width'], width, 320, 4000), height: safeNumber(layout['height'], height, 320, 4000) })) : [];
  const exportProfiles = Array.isArray(source['exportProfiles']) ? source['exportProfiles'].filter(object).slice(0, 12).map((profile, index) => ({ id: typeof profile['id'] === 'string' && profile['id'].trim() ? profile['id'].slice(0, 60) : `profile-${index + 1}`, width: safeNumber(profile['width'], width, 320, 4000), height: safeNumber(profile['height'], height, 320, 4000), unit: 'px' as const })) : [];
  const palette = Array.isArray(sourceTheme['palette']) ? sourceTheme['palette'].slice(0, 8).map((value, index) => safeColor(value, fallbackPalette[index % fallbackPalette.length]!)) : fallbackPalette;
  return {
    schemaVersion: 1,
    metadata: { ...(typeof rawMetadata['templateSlug'] === 'string' ? { templateSlug: rawMetadata['templateSlug'].slice(0, 100) } : {}), ...(Number.isInteger(rawMetadata['templateVersion']) ? { templateVersion: rawMetadata['templateVersion'] } : {}), category, style },
    canvas: { width, height, unit: 'px' },
    theme: { category, style, palette: palette.length >= 2 ? palette : fallbackPalette, tokens: { primary, secondary, background, font } },
    assets: Array.isArray(source['assets']) ? source['assets'].filter(object).map((asset) => ({ ...(typeof asset['id'] === 'string' ? { id: asset['id'] } : {}), ...(typeof asset['role'] === 'string' ? { role: asset['role'] } : {}), ...(typeof asset['assetId'] === 'string' ? { assetId: asset['assetId'] } : {}), ...(typeof asset['zone'] === 'string' ? { zone: asset['zone'] } : {}), ...(Number.isInteger(asset['width']) ? { width: safeNumber(asset['width'], 1, 1, 8192) } : {}), ...(Number.isInteger(asset['height']) ? { height: safeNumber(asset['height'], 1, 1, 8192) } : {}), ...(asset['mimeType'] === 'image/webp' ? { mimeType: 'image/webp' } : {}) })) : [],
    elements,
    variables,
    constraints: { safeMargin, allowOverflow: rawConstraints['allowOverflow'] === true },
    layouts: layouts.length ? layouts : [{ id: 'portrait', name: 'Portrait', width, height }],
    ceremonyRules: Array.isArray(source['ceremonyRules']) ? source['ceremonyRules'].filter(object).map((rule) => ({ ...(typeof rule['ceremonyType'] === 'string' ? { ceremonyType: rule['ceremonyType'] } : {}), ...(typeof rule['elementId'] === 'string' ? { elementId: rule['elementId'] } : {}), ...(typeof rule['required'] === 'boolean' ? { required: rule['required'] } : {}) })) : [],
    exportProfiles: exportProfiles.length ? exportProfiles : [{ id: 'MOBILE_PORTRAIT', width, height, unit: 'px' }],
    version: Number.isInteger(source['version']) && Number(source['version']) >= 1 ? Number(source['version']) : 1,
  } as DesignDocument;
}

function validateLegacyDesignDocument(input: unknown): DesignDocument {
  if (!object(input)) fail('Le document doit être un objet JSON.');
  onlyKeys(input, ['schemaVersion', 'metadata', 'canvas', 'theme', 'assets', 'elements', 'variables', 'constraints', 'layouts', 'ceremonyRules', 'exportProfiles', 'version'], 'Le document');
  if (input['schemaVersion'] !== 1 || !object(input['metadata']) || !object(input['canvas']) || !object(input['theme']) || !object(input['constraints'])) fail('Structure de document invalide.');
  onlyKeys(input['metadata'], ['templateSlug', 'templateVersion', 'category', 'style'], 'Les métadonnées');
  onlyKeys(input['canvas'], ['width', 'height', 'unit'], 'Le canevas');
  onlyKeys(input['theme'], ['category', 'style', 'palette', 'tokens'], 'Le thème');
  onlyKeys(input['constraints'], ['safeMargin', 'allowOverflow'], 'Les contraintes');
  const width = number(input['canvas']['width'], 'canvas.width', 320, 4000);
  const height = number(input['canvas']['height'], 'canvas.height', 320, 4000);
  if (input['canvas']['unit'] !== 'px') fail('L’unité du canevas doit être px.');
  if (typeof input['theme']['category'] !== 'string' || !['WEDDING', 'BIRTHDAY', 'GRADUATION', 'BAPTISM', 'BABY_SHOWER', 'GALA', 'CONFERENCE'].includes(input['theme']['category'])) fail('La catégorie du thème est invalide.');
  scalar(input['theme']['style'], 'theme.style', 60);
  if (!Array.isArray(input['theme']['palette']) || input['theme']['palette'].length < 2 || input['theme']['palette'].length > 8) fail('La palette doit contenir de 2 à 8 couleurs.');
  input['theme']['palette'].forEach((entry, index) => color(entry, `theme.palette[${index}]`));
  if (!object(input['theme']['tokens'])) fail('theme.tokens doit être un objet.');
  onlyKeys(input['theme']['tokens'], ['primary', 'secondary', 'background', 'font'], 'Les tokens du thème');
  color(input['theme']['tokens']['primary'], 'theme.tokens.primary'); color(input['theme']['tokens']['secondary'], 'theme.tokens.secondary'); color(input['theme']['tokens']['background'], 'theme.tokens.background');
  scalar(input['theme']['tokens']['font'], 'theme.tokens.font', 80);
  if (typeof input['version'] !== 'number' || !Number.isInteger(input['version']) || input['version'] < 1 || input['version'] > 1_000_000) fail('La version du document est invalide.');
  const margin = input['constraints']['safeMargin'];
  if (object(margin)) {
    onlyKeys(margin, ['top', 'right', 'bottom', 'left'], 'Les marges de sécurité');
    for (const edge of ['top', 'right', 'bottom', 'left']) number(margin[edge], `constraints.safeMargin.${edge}`, 0, Math.min(width, height) / 4);
  } else number(margin, 'constraints.safeMargin', 0, Math.min(width, height) / 4);
  if (typeof input['constraints']['allowOverflow'] !== 'boolean') fail('Les contraintes du canevas sont invalides.');

  const variables = entries(input['variables'], 'variables', 1, 50);
  const keys = new Set<string>();
  for (const variable of variables) {
    onlyKeys(variable, ['key', 'label', 'type', 'defaultValue', 'required'], 'Une variable');
    const key = scalar(variable['key'], 'variable.key', 60);
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,59}$/.test(key) || keys.has(key)) fail('Les clés de variables doivent être uniques et valides.');
    keys.add(key); scalar(variable['label'], 'variable.label', 100);
    if (variable['type'] !== 'TEXT' || typeof variable['required'] !== 'boolean') fail('Les variables prennent actuellement en charge uniquement le texte.');
    if (variable['required']) scalar(variable['defaultValue'], 'variable.defaultValue', 500);
    else if (typeof variable['defaultValue'] !== 'string' || variable['defaultValue'].length > 500 || /[\u0000-\u001f\u007f]/.test(variable['defaultValue'])) fail('variable.defaultValue est invalide.');
  }

  const elements = entries(input['elements'], 'elements', 1, 100);
  const ids = new Set<string>();
  for (const element of elements) {
    onlyKeys(element, ['id', 'type', 'name', 'x', 'y', 'width', 'height', 'rotation', 'locked', 'editable', 'zIndex', 'fill', 'shape', 'stroke', 'strokeWidth', 'text', 'fontFamily', 'fontSize', 'fontWeight', 'align', 'color', 'source', 'assetId', 'originalAssetId', 'derivedAssetId', 'sourceWidth', 'sourceHeight', 'fit', 'cropX', 'cropY', 'cropScale', 'opacity', 'role', 'minFontSize', 'maxFontSize', 'maxLines', 'lineHeight', 'overflowPolicy', 'hideWhenEmpty', 'collapseSpace', 'minSize', 'maxSize', 'quietZone'], 'Un calque');
    const id = scalar(element['id'], 'element.id', 80);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) fail('Les identifiants de calques doivent être uniques et valides.');
    ids.add(id); scalar(element['name'], 'element.name', 100);
    for (const field of ['x', 'y']) number(element[field], `element.${field}`, 0, field === 'x' ? width : height);
    for (const field of ['width', 'height']) number(element[field], `element.${field}`, 1, field === 'width' ? width : height);
    if ((element['x'] as number) + (element['width'] as number) > width || (element['y'] as number) + (element['height'] as number) > height) fail(`Le calque ${String(element['name'])} dépasse le canevas.`);
    number(element['rotation'], 'element.rotation', -360, 360); number(element['zIndex'], 'element.zIndex', 0, 10_000);
    if (typeof element['locked'] !== 'boolean' || typeof element['editable'] !== 'boolean' || element['editable'] && element['locked']) fail('L’état de modification du calque est invalide.');
    if (element['type'] === 'BACKGROUND') {
      if (element['x'] !== 0 || element['y'] !== 0 || element['width'] !== width || element['height'] !== height || element['editable'] !== false || element['locked'] !== true) fail('Un fond doit couvrir le canevas et rester verrouillé.');
      color(element['fill'], 'background.fill');
    } else if (element['type'] === 'SHAPE') {
      if (element['shape'] !== 'RECTANGLE') fail('Seuls les rectangles sont actuellement disponibles dans l’éditeur.');
      color(element['fill'], 'shape.fill', true); color(element['stroke'], 'shape.stroke'); number(element['strokeWidth'], 'shape.strokeWidth', 0, 24);
    } else if (element['type'] === 'IMAGE') {
      scalar(element['assetId'], 'image.assetId', 36);
      if (!/^[0-9a-f-]{36}$/i.test(element['assetId'] as string)) fail('L’identifiant de média est invalide.');
      for (const field of ['originalAssetId', 'derivedAssetId']) if (element[field] !== undefined && (typeof element[field] !== 'string' || !/^[0-9a-f-]{36}$/i.test(element[field] as string))) fail(`L’identifiant ${field} est invalide.`);
      number(element['sourceWidth'], 'image.sourceWidth', 1, 8192);
      number(element['sourceHeight'], 'image.sourceHeight', 1, 8192);
      if (!['cover', 'contain'].includes(String(element['fit']))) fail('Le mode d’image est invalide.');
      number(element['cropX'], 'image.cropX', 0, 100);
      number(element['cropY'], 'image.cropY', 0, 100);
      number(element['cropScale'], 'image.cropScale', 1, 3);
      number(element['opacity'], 'image.opacity', 0, 1);
    } else if (element['type'] === 'QR') {
      if (element['source'] !== 'guest_access_token') fail('La source du QR doit être le jeton privé de l’invitation.');
      number(element['minSize'], 'qr.minSize', 64, 256); number(element['maxSize'], 'qr.maxSize', 96, 512); number(element['quietZone'], 'qr.quietZone', 2, 8);
    } else if (element['type'] === 'TEXT') {
      if (typeof element['text'] !== 'string' || element['text'].length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001f\u007f]/.test(element['text'])) fail('element.text est invalide.');
      const expression = /\{\{([a-zA-Z][a-zA-Z0-9_]{0,59})\}\}/g;
      for (const match of element['text'].matchAll(expression)) if (!keys.has(match[1]!)) fail(`Variable inconnue : ${match[1]}.`);
      scalar(element['fontFamily'], 'element.fontFamily', 80); number(element['fontSize'], 'element.fontSize', 8, 180);
      number(element['fontWeight'], 'element.fontWeight', 100, 900);
      if (![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(element['fontWeight'] as number) || !['left', 'center', 'right'].includes(String(element['align']))) fail('La typographie du calque est invalide.');
      if (!['COUPLE_NAMES', 'GUEST_NAME', 'EVENT_TITLE', 'CEREMONY_INFO', 'TABLE_INFO', 'BODY', 'SMALL_DETAIL'].includes(String(element['role']))) fail('Le rôle du texte est invalide.');
      number(element['minFontSize'], 'text.minFontSize', 8, 180); number(element['maxFontSize'], 'text.maxFontSize', 8, 180); number(element['maxLines'], 'text.maxLines', 1, 20); number(element['lineHeight'], 'text.lineHeight', 0.85, 2);
      if ((element['minFontSize'] as number) > (element['maxFontSize'] as number) || typeof element['hideWhenEmpty'] !== 'boolean' || typeof element['collapseSpace'] !== 'boolean' || !['ERROR', 'WARN'].includes(String(element['overflowPolicy']))) fail('Les règles de mise en page du texte sont invalides.');
      color(element['color'], 'text.color');
    } else fail('Type de calque non pris en charge.');
  }
  entries(input['assets'], 'assets', 0, 50).forEach((asset) => { onlyKeys(asset, ['id', 'role', 'assetId', 'zone', 'width', 'height', 'mimeType'], 'Un asset'); if (asset['assetId'] !== undefined) scalar(asset['assetId'], 'asset.assetId', 36); for (const field of ['width', 'height']) if (asset[field] !== undefined) number(asset[field], `asset.${field}`, 1, 8192); if (asset['mimeType'] !== undefined && !['image/webp', 'image/png'].includes(String(asset['mimeType']))) fail('Le média stocké doit être un PNG ou WebP validé.'); });
  entries(input['layouts'], 'layouts', 1, 12).forEach((layout) => { onlyKeys(layout, ['id', 'name', 'width', 'height'], 'Un layout'); scalar(layout['id'], 'layout.id', 60); scalar(layout['name'], 'layout.name', 100); number(layout['width'], 'layout.width', 320, 4000); number(layout['height'], 'layout.height', 320, 4000); });
  entries(input['ceremonyRules'], 'ceremonyRules', 0, 20).forEach((rule) => onlyKeys(rule, ['ceremonyType', 'elementId', 'required'], 'Une règle de cérémonie'));
  entries(input['exportProfiles'], 'exportProfiles', 1, 12).forEach((profile) => { onlyKeys(profile, ['id', 'width', 'height', 'unit'], 'Un profil de format'); scalar(profile['id'], 'exportProfile.id', 60); number(profile['width'], 'exportProfile.width', 320, 4000); number(profile['height'], 'exportProfile.height', 320, 4000); if (profile['unit'] !== 'px') fail('Un profil de format doit utiliser les pixels.'); });
  if (!Array.isArray(input['assets']) || !Array.isArray(input['elements']) || !Array.isArray(input['layouts']) || !Array.isArray(input['ceremonyRules']) || !Array.isArray(input['exportProfiles'])) fail('Le document doit contenir toutes ses collections.');
  return input as DesignDocument;
}

function legacyProjection(input: DesignDocument): Record<string, unknown> {
  const projected = structuredClone(input) as Record<string, unknown>;
  projected['schemaVersion'] = 1;
  // v2 metadata is preserved in the real document; the legacy adapter only validates v1 fields.
  projected['metadata'] = Object.fromEntries(Object.entries(input['metadata'] ?? {}).filter(([key]) => ['templateSlug', 'templateVersion', 'category', 'style'].includes(key)));
  for (const key of ['safeArea', 'bleed', 'groups', 'layoutVariants']) delete projected[key];
  projected['elements'] = input.elements.map((element: Record<string, unknown>) => {
    const next = { ...element };
    const semanticBinding = next['binding'];
    const preferredFontSize = next['preferredFontSize'];
    for (const key of ['binding', 'fontId', 'preferredFontSize', 'visibility', 'groupId', 'maskId', 'focalPoint', 'blur', 'overlay']) delete next[key];
    if (next['type'] === 'TEXT') {
      if (semanticBinding) next['text'] = '';
      next['maxFontSize'] = preferredFontSize ?? next['maxFontSize'] ?? next['fontSize'];
      next['overflowPolicy'] = next['overflowPolicy'] === 'WARN' ? 'WARN' : 'ERROR';
    }
    return next;
  });
  if (!Array.isArray(projected['variables']) || projected['variables'].length === 0) projected['variables'] = [{ key: 'legacyText', label: 'Texte', type: 'TEXT', defaultValue: '', required: false }];
  return projected;
}

/** Normalize historical v1 data in memory to the current v2 shape. Nothing is persisted by this adapter. */
export function normalizeDesignDocument(value: unknown): DesignDocument {
  try {
    if (object(value) && value['schemaVersion'] === 2) {
      const normalized = validateDesignDocumentV2(value) as DesignDocument;
      validateLegacyDesignDocument(legacyProjection(normalized));
      return normalized;
    }
    const legacy = normalizeLegacyDesignDocument(value);
    const upgraded = normalizeDesignDocumentV2(legacy) as DesignDocument;
    validateDesignDocumentV2(upgraded);
    validateLegacyDesignDocument(legacyProjection(upgraded));
    return upgraded;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    fail(error instanceof Error ? error.message : 'Le document de design est invalide.');
  }
}

export function validateDesignDocument(input: unknown): DesignDocument {
  if (object(input) && input['schemaVersion'] === 2) {
    try {
      const validated = validateDesignDocumentV2(input) as DesignDocument;
      validateLegacyDesignDocument(legacyProjection(validated));
      return validated;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      fail(error instanceof Error ? error.message : 'Le document de design est invalide.');
    }
  }
  return validateLegacyDesignDocument(input);
}

export function templateVariables(document: DesignDocument) {
  return (document['variables'] as Record<string, unknown>[]).map((variable) => ({ key: variable['key'], label: variable['label'], required: variable['required'] }));
}
