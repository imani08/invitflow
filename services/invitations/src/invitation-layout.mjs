const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function estimatedWidth(text, fontSize) {
  return [...text].reduce((sum, char) => sum + fontSize * (/[MW@#%]/u.test(char) ? 0.82 : /[il.,' ]/u.test(char) ? 0.3 : 0.56), 0);
}

function wrap(text, width, fontSize) {
  const lines = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    let line = '';
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const candidate = line ? line + ' ' + word : word;
      if (line && estimatedWidth(candidate, fontSize) > width) { lines.push(line); line = word; }
      else line = candidate;
      while (estimatedWidth(line, fontSize) > width && [...line].length > 1) {
        const chars = [...line];
        let take = chars.length;
        while (take > 1 && estimatedWidth(chars.slice(0, take).join(''), fontSize) > width) take--;
        lines.push(chars.slice(0, take).join(''));
        line = chars.slice(take).join('');
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

export function fitInvitationText(layer, text) {
  const width = Number(layer.width);
  const height = Number(layer.height);
  const maxFontSize = clamp(Number(layer.maxFontSize ?? layer.fontSize ?? 36), 8, 180);
  const minFontSize = clamp(Number(layer.minFontSize ?? Math.min(12, maxFontSize)), 8, maxFontSize);
  const maxLines = clamp(Number(layer.maxLines ?? 4), 1, 20);
  const maxWidth = Math.max(1, width - Math.max(0, Number(layer.paddingX ?? 0)) * 2);
  const maxLineHeight = clamp(Number(layer.lineHeight ?? 1.2), 0.85, 2);
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 1) {
    const lines = wrap(text, maxWidth, fontSize);
    const lineHeight = maxLineHeight;
    const needsNameFit = /guest|invité/i.test(String(layer.role ?? layer.name ?? '')) && [...text].length > 48;
    if (lines.length <= maxLines && lines.length * fontSize * lineHeight <= height && (!needsNameFit || fontSize < maxFontSize))
      return { fontSize, lines, lineHeight, reduced: fontSize < maxFontSize, overflow: false };
  }
  const lines = wrap(text, maxWidth, minFontSize);
  return { fontSize: minFontSize, lines, lineHeight: maxLineHeight, reduced: minFontSize < maxFontSize, overflow: true };
}

const overlaps = (a, b, padding = 0) => a.x < b.x + b.width + padding && a.x + a.width + padding > b.x && a.y < b.y + b.height + padding && a.y + a.height + padding > b.y;

export function validateInvitationLayout({ document, values = {}, safeMargin = 64 }) {
  const errors = [];
  const warnings = [];
  const canvas = document.canvas ?? { width: 1080, height: 1920 };
  const elements = Array.isArray(document.elements) ? document.elements : [];
  for (const variable of Array.isArray(document.variables) ? document.variables : []) {
    if (!variable.required) continue;
    const value = values[variable.key] ?? variable.defaultValue;
    if (!String(value ?? '').trim()) errors.push({ code: 'MISSING_REQUIRED_VARIABLE', message: `${variable.label ?? variable.key} est requis.` });
  }
  const margins = typeof safeMargin === 'number' ? { top: safeMargin, right: safeMargin, bottom: safeMargin, left: safeMargin } : safeMargin;
  const boxes = [];
  for (const layer of elements) {
    if (layer.type === 'TEXT') {
      const templateText = String(layer.text ?? '');
      const missingOptional = [...templateText.matchAll(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/gu)].some(([, key]) => !String(values[key] ?? '').trim());
      const text = templateText.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/gu, (_m, key) => String(values[key] ?? ''));
      if (layer.hideWhenEmpty && missingOptional) {
        warnings.push({ code: 'OPTIONAL_FIELD_HIDDEN', layerId: layer.id });
        continue;
      }
      const fit = fitInvitationText(layer, text);
      if (fit.overflow) errors.push({ code: 'TEXT_OVERFLOW', layerId: layer.id, message: `${layer.name ?? 'Le texte'} ne tient pas dans sa zone.` });
      else if (fit.reduced) warnings.push({ code: 'FONT_REDUCED', layerId: layer.id });
      if (fit.lines.length > 1 && /guest|invite/i.test(String(layer.role ?? layer.name ?? ''))) warnings.push({ code: 'MULTILINE_GUEST_NAME', layerId: layer.id });
      if (!text.trim() && !layer.hideWhenEmpty) continue;
      const essential = ['GUEST_NAME', 'TABLE_INFO', 'EVENT_TITLE', 'COUPLE_NAMES'].includes(String(layer.role ?? ''));
      const box = { x: Number(layer.x), y: Number(layer.y), width: Number(layer.width), height: Number(layer.height), layer };
      boxes.push({ ...box, essential });
      if (essential && (box.x < margins.left || box.y < margins.top || box.x + box.width > canvas.width - margins.right || box.y + box.height > canvas.height - margins.bottom || (box.layer.role === 'GUEST_NAME' && box.y + box.height > canvas.height * 0.85)))
        errors.push({ code: 'OUTSIDE_SAFE_AREA', layerId: layer.id, message: `${layer.name ?? 'Un bloc essentiel'} dépasse la marge de sécurité.` });
    } else if (layer.type === 'QR') {
      const size = Math.min(Number(layer.width), Number(layer.height));
      if (size < Number(layer.minSize ?? 96)) errors.push({ code: 'QR_TOO_SMALL', layerId: layer.id, message: 'La zone QR est trop petite pour rester lisible.' });
      if (size > Number(layer.maxSize ?? 512)) errors.push({ code: 'QR_TOO_LARGE', layerId: layer.id, message: 'La zone QR dépasse la taille maximale du modèle.' });
      boxes.push({ x: Number(layer.x), y: Number(layer.y), width: Number(layer.width), height: Number(layer.height), layer, qr: true });
    } else if (layer.type === 'IMAGE') {
      boxes.push({ x: Number(layer.x), y: Number(layer.y), width: Number(layer.width), height: Number(layer.height), layer, image: true });
    }
  }
  for (const box of boxes.filter((entry) => entry.qr)) {
    for (const other of boxes.filter((entry) => entry !== box && (entry.essential || entry.image))) {
      if (overlaps(box, other, 12)) errors.push({ code: 'CRITICAL_COLLISION', layerId: other.layer.id, otherLayerId: box.layer.id, message: `${other.layer.name ?? 'Un élément'} chevauche le QR.` });
    }
  }
  for (const box of boxes.filter((entry) => entry.essential)) {
    for (const image of boxes.filter((entry) => entry.image)) {
      if (overlaps(box, image, 12)) errors.push({ code: 'CRITICAL_COLLISION', layerId: box.layer.id, otherLayerId: image.layer.id, message: `${box.layer.name ?? 'Un champ essentiel'} chevauche la photo.` });
    }
  }
  return { errors, warnings };
}
