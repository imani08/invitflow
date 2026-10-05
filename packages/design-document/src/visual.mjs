/** Closed, immutable catalogue. A geometry change requires a new mask identifier. */
export const MASK_REGISTRY = Object.freeze(Object.fromEntries(Object.entries({
  none: { version: 1, kind: 'rect' },
  'rounded-soft': { version: 1, kind: 'rounded' },
  'organic-portrait-01': { version: 1, kind: 'clip', path: 'M.18 .04 C.32 -.02 .69 .01 .83 .12 C1 .27 .92 .42 .98 .57 C1 .78 .81 .97 .57 .98 C.34 1 .05 .88 .04 .68 C.02 .47 -.01 .19 .18 .04 Z' },
  'watercolor-soft-01': { version: 1, kind: 'mask', path: 'M.03 .16 L.10 .12 .08 .07 .23 .09 .31 .03 .41 .07 .54 .02 .67 .08 .80 .03 .86 .10 .96 .09 .93 .24 .99 .35 .95 .47 .99 .58 .93 .69 .97 .81 .87 .87 .81 .96 .67 .91 .55 .98 .43 .93 .31 .98 .22 .91 .08 .94 .10 .81 .02 .73 .06 .61 .01 .49 .06 .37 .02 .28 Z' },
  'brush-edge-01': { version: 1, kind: 'clip', path: 'M.06 .08 L.48 .03 .42 .08 .93 .02 .86 .09 .98 .12 .94 .22 .99 .25 .95 .41 .99 .43 .96 .61 .99 .64 .92 .88 .53 .96 .58 .91 .08 .98 .13 .91 .02 .88 .06 .69 .01 .66 .05 .49 .01 .45 .06 .24 .02 .20 Z' },
}).map(([id, definition]) => [id, Object.freeze({ id, ...definition })])));

export const IMAGE_ROLES = Object.freeze(['BACKGROUND', 'FOREGROUND', 'DECORATION', 'TEXTURE', 'PHOTO']);

/** Only images painted after critical content can obscure it in v2. Background layering is intentional. */
export function visualOcclusionIssues(elements) {
  const issues = [];
  elements.forEach((critical, index) => {
    if (!['TEXT', 'QR'].includes(critical.type)) return;
    for (const image of elements.slice(index + 1)) {
      if (image.type !== 'IMAGE' || image.opacity === 0) continue;
      if (critical.x < image.x + image.width && critical.x + critical.width > image.x && critical.y < image.y + image.height && critical.y + critical.height > image.y) issues.push({ code: 'CRITICAL_COLLISION', elementId: critical.id, otherElementId: image.id, message: 'Une image au premier plan risque de masquer un texte ou QR essentiel.' });
    }
  });
  return issues;
}
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max, fallback) => Math.max(min, Math.min(max, finite(value, fallback)));
const escape = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (message) => { throw new TypeError(message); };
const range = (value, min, max, name) => { if (!Number.isFinite(value) || value < min || value > max) fail(`${name} is outside the allowed range`); };
const color = (value) => { if (typeof value !== 'string' || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)) fail('Overlay color must be hexadecimal'); };
export function validateVisualProperties(layer) {
  if (layer.type === 'IMAGE') {
    if (typeof layer.assetId !== 'string' || !layer.assetId || layer.assetId.length > 100) fail('Image asset reference is invalid');
    if (layer.fit !== undefined && !['cover', 'contain'].includes(layer.fit)) fail('Image fit is invalid');
    for (const field of ['sourceWidth', 'sourceHeight']) if (layer[field] !== undefined) range(layer[field], 1, 8192, field);
    for (const field of ['cropX', 'cropY']) if (layer[field] !== undefined) range(layer[field], 0, 100, field);
    if (layer.cropScale !== undefined) range(layer.cropScale, 1, 3, 'cropScale');
    if (layer.rotation !== undefined) range(layer.rotation, -360, 360, 'rotation');
    if (layer.opacity !== undefined) range(layer.opacity, 0, 1, 'opacity');
  }
  if (layer.maskId !== undefined && (layer.type !== 'IMAGE' || !Object.hasOwn(MASK_REGISTRY, layer.maskId))) fail('maskId must reference a registered image mask identifier');
  if (layer.type === 'IMAGE' && layer.role !== undefined && !IMAGE_ROLES.includes(layer.role)) fail('Image visual role is invalid');
  if (layer.focalPoint !== undefined) {
    if (layer.type !== 'IMAGE' || !object(layer.focalPoint) || Object.keys(layer.focalPoint).some((key) => !['x', 'y'].includes(key))) fail('Invalid focal point');
    range(layer.focalPoint.x, 0, 1, 'focalPoint.x'); range(layer.focalPoint.y, 0, 1, 'focalPoint.y');
  }
  if (layer.blur !== undefined) { if (layer.type !== 'IMAGE') fail('Blur requires an image'); range(layer.blur, 0, 24, 'blur'); }
  if (layer.overlay !== undefined) {
    const overlay = layer.overlay;
    if (!['IMAGE', 'SHAPE', 'BACKGROUND'].includes(layer.type) || !object(overlay) || Object.keys(overlay).some((key) => !['type', 'color', 'opacity', 'angle', 'stops'].includes(key)) || !['solid', 'linear-gradient'].includes(overlay.type)) fail('Invalid overlay');
    range(overlay.opacity, 0, 1, 'overlay.opacity');
    if (overlay.type === 'solid') { color(overlay.color); if (overlay.stops !== undefined || overlay.angle !== undefined) fail('Invalid solid overlay'); }
    else {
      range(overlay.angle, 0, 360, 'overlay.angle');
      if (overlay.color !== undefined || !Array.isArray(overlay.stops) || overlay.stops.length < 2 || overlay.stops.length > 6) fail('Invalid gradient stops');
      let previous = -1;
      for (const stop of overlay.stops) {
        if (!object(stop) || Object.keys(stop).some((key) => !['offset', 'color'].includes(key))) fail('Invalid gradient stop');
        range(stop.offset, 0, 1, 'gradient.offset'); color(stop.color);
        if (stop.offset < previous) fail('Gradient stops must be ordered'); previous = stop.offset;
      }
    }
  }
}

export function imageRenderBounds(layer) {
  const x = finite(layer.x), y = finite(layer.y), width = Math.max(1, finite(layer.width, 1)), height = Math.max(1, finite(layer.height, 1));
  const sourceWidth = Math.max(1, finite(layer.sourceWidth, width)), sourceHeight = Math.max(1, finite(layer.sourceHeight, height));
  const ratio = sourceWidth / sourceHeight, boxRatio = width / height, cover = layer.fit !== 'contain';
  const frameWidth = cover ? (ratio > boxRatio ? height * ratio : width) : (ratio > boxRatio ? width : height * ratio);
  const scale = clamp(layer.cropScale, 1, 3, 1), renderedWidth = frameWidth * scale, renderedHeight = frameWidth / ratio * scale;
  const position = (origin, box, rendered, focal, crop) => focal === undefined ? origin + (box - rendered) * clamp(crop, 0, 100, 50) / 100 : origin + (rendered >= box ? Math.max(box - rendered, Math.min(0, box / 2 - clamp(focal, 0, 1, 0.5) * rendered)) : (box - rendered) / 2);
  return { x: position(x, width, renderedWidth, layer.focalPoint?.x, layer.cropX), y: position(y, height, renderedHeight, layer.focalPoint?.y, layer.cropY), width: renderedWidth, height: renderedHeight };
}

/** Effective cropped source density for the physical target, without fetching source bytes. */
export function assessImageResolution(layer, canvas, target = { mode: 'print', widthMm: 148, heightMm: 210 }) {
  if (target.mode === 'web') return { status: 'OK', effectiveDpi: null, target: 'web' };
  if (!Number.isFinite(layer.sourceWidth) || !Number.isFinite(layer.sourceHeight) || layer.sourceWidth <= 0 || layer.sourceHeight <= 0) return { status: 'WARNING', effectiveDpi: null, target: 'print', code: 'IMAGE_RESOLUTION_UNKNOWN' };
  const mmPerLogicalPixel = Math.min((target.widthMm ?? 148) / canvas.width, (target.heightMm ?? 210) / canvas.height);
  const bounds = imageRenderBounds(layer);
  const dpi = Math.min(layer.sourceWidth / (bounds.width * mmPerLogicalPixel / 25.4), layer.sourceHeight / (bounds.height * mmPerLogicalPixel / 25.4));
  return { status: dpi < 72 ? 'ERROR' : dpi < 150 ? 'WARNING' : 'OK', effectiveDpi: Math.round(dpi), target: 'print', code: dpi < 150 ? 'IMAGE_RESOLUTION_LOW' : undefined };
}

export function renderOverlaySvg(overlay, layer, prefix) {
  if (!overlay) return '';
  validateVisualProperties({ type: 'SHAPE', overlay });
  let fill = overlay.color, definitions = '';
  if (overlay.type === 'linear-gradient') {
    const angle = overlay.angle * Math.PI / 180, dx = Math.cos(angle) / 2, dy = Math.sin(angle) / 2, id = `${prefix}-gradient`;
    definitions = `<defs><linearGradient id="${id}" x1="${0.5 - dx}" y1="${0.5 - dy}" x2="${0.5 + dx}" y2="${0.5 + dy}">${overlay.stops.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`).join('')}</linearGradient></defs>`;
    fill = `url(#${id})`;
  }
  return `${definitions}<rect x="${finite(layer.x)}" y="${finite(layer.y)}" width="${finite(layer.width)}" height="${finite(layer.height)}" fill="${fill}" opacity="${overlay.opacity}"/>`;
}

/** Trusted geometry only. No arbitrary markup or external asset URLs are accepted. */
export function renderVisualImageSvg(layer, href, { rotation = true } = {}) {
  validateVisualProperties(layer);
  if (typeof href !== 'string' || !/^(?:blob:|data:image\/(?:png|webp);base64,)/.test(href)) fail('A private PNG/WebP data source or preview blob is required');
  const mask = MASK_REGISTRY[layer.maskId ?? 'none'];
  const x = finite(layer.x), y = finite(layer.y), w = finite(layer.width), h = finite(layer.height), bounds = imageRenderBounds(layer);
  const id = `visual-${String(layer.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`, clipId = `${id}-frame`, softId = `${id}-soft`, blurId = `${id}-blur`;
  const transform = rotation && layer.rotation ? ` transform="rotate(${finite(layer.rotation)} ${x + w / 2} ${y + h / 2})"` : '';
  let definitions = '', clipAttribute;
  if (mask.kind === 'mask') {
    definitions = `<filter id="${softId}" x="-.1" y="-.1" width="1.2" height="1.2" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation=".008"/></filter><mask id="${clipId}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" style="mask-type:alpha"><g transform="translate(${x} ${y}) scale(${w} ${h})"><path d="${mask.path}" fill="white" filter="url(#${softId})"/></g></mask>`;
    clipAttribute = `mask="url(#${clipId})"`;
  } else {
    const shape = mask.path ? `<path d="${mask.path}" transform="translate(${x} ${y}) scale(${w} ${h})"/>` : `<rect x="${x}" y="${y}" width="${w}" height="${h}"${mask.kind === 'rounded' ? ` rx="${Math.min(w, h) * 0.08}"` : ''}/>`;
    definitions = `<clipPath id="${clipId}" clipPathUnits="userSpaceOnUse">${shape}</clipPath>`; clipAttribute = `clip-path="url(#${clipId})"`;
  }
  if (layer.blur) definitions += `<filter id="${blurId}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${layer.blur}"/></filter>`;
  return `<defs>${definitions}</defs><g${transform} opacity="${clamp(layer.opacity, 0, 1, 1)}"><g ${clipAttribute}><image href="${escape(href)}" x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" preserveAspectRatio="none"${layer.blur ? ` filter="url(#${blurId})"` : ''}/>${renderOverlaySvg(layer.overlay, layer, id)}</g></g>`;
}
