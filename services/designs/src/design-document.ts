import { BadRequestException } from '@nestjs/common';

export type DesignDocument = Record<string, unknown> & {
  schemaVersion: 1;
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

export function validateDesignDocument(input: unknown): DesignDocument {
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
  if (typeof input['constraints']['safeMargin'] !== 'number' || input['constraints']['safeMargin'] < 0 || input['constraints']['safeMargin'] > Math.min(width, height) / 4 || typeof input['constraints']['allowOverflow'] !== 'boolean') fail('Les contraintes du canevas sont invalides.');

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
    onlyKeys(element, ['id', 'type', 'name', 'x', 'y', 'width', 'height', 'rotation', 'locked', 'editable', 'zIndex', 'fill', 'shape', 'stroke', 'strokeWidth', 'text', 'fontFamily', 'fontSize', 'fontWeight', 'align', 'color'], 'Un calque');
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
    } else if (element['type'] === 'TEXT') {
      if (typeof element['text'] !== 'string' || element['text'].length > 500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001f\u007f]/.test(element['text'])) fail('element.text est invalide.');
      const expression = /\{\{([a-zA-Z][a-zA-Z0-9_]{0,59})\}\}/g;
      for (const match of element['text'].matchAll(expression)) if (!keys.has(match[1]!)) fail(`Variable inconnue : ${match[1]}.`);
      scalar(element['fontFamily'], 'element.fontFamily', 80); number(element['fontSize'], 'element.fontSize', 8, 180);
      number(element['fontWeight'], 'element.fontWeight', 100, 900);
      if (![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(element['fontWeight'] as number) || !['left', 'center', 'right'].includes(String(element['align']))) fail('La typographie du calque est invalide.');
      color(element['color'], 'text.color');
    } else fail('Type de calque non pris en charge.');
  }
  entries(input['assets'], 'assets', 0, 50).forEach((asset) => onlyKeys(asset, ['id', 'role', 'assetId', 'zone'], 'Un asset'));
  entries(input['layouts'], 'layouts', 1, 12).forEach((layout) => { onlyKeys(layout, ['id', 'name', 'width', 'height'], 'Un layout'); scalar(layout['id'], 'layout.id', 60); scalar(layout['name'], 'layout.name', 100); number(layout['width'], 'layout.width', 320, 4000); number(layout['height'], 'layout.height', 320, 4000); });
  entries(input['ceremonyRules'], 'ceremonyRules', 0, 20).forEach((rule) => onlyKeys(rule, ['ceremonyType', 'elementId', 'required'], 'Une règle de cérémonie'));
  entries(input['exportProfiles'], 'exportProfiles', 1, 12).forEach((profile) => { onlyKeys(profile, ['id', 'width', 'height', 'unit'], 'Un profil de format'); scalar(profile['id'], 'exportProfile.id', 60); number(profile['width'], 'exportProfile.width', 320, 4000); number(profile['height'], 'exportProfile.height', 320, 4000); if (profile['unit'] !== 'px') fail('Un profil de format doit utiliser les pixels.'); });
  if (!Array.isArray(input['assets']) || !Array.isArray(input['elements']) || !Array.isArray(input['layouts']) || !Array.isArray(input['ceremonyRules']) || !Array.isArray(input['exportProfiles'])) fail('Le document doit contenir toutes ses collections.');
  return input as DesignDocument;
}

export function templateVariables(document: DesignDocument) {
  return (document['variables'] as Record<string, unknown>[]).map((variable) => ({ key: variable['key'], label: variable['label'], required: variable['required'] }));
}
