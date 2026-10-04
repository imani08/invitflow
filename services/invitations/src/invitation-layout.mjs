import { fitInvitationText, resolveDesignLayout } from '@invitaflow/design-document';

export { fitInvitationText };

const overlaps = (a, b, padding = 0) => a.x < b.x + b.width + padding && a.x + a.width + padding > b.x && a.y < b.y + b.height + padding && a.y + a.height + padding > b.y;

function layoutSnapshot(values) {
  return {
    guest: { name: String(values.guest_name ?? values.guestname ?? values.guest_full_name ?? ''), email: String(values.guest_email ?? '') },
    table: { name: String(values.table_name ?? values.tablename ?? values.tableName ?? '') },
    event: { title: String(values.event_name ?? values.eventname ?? ''), coupleNames: String(values.couple_names ?? ''), invitationText: String(values.invitation_text ?? ''), date: String(values.event_date ?? ''), venue: String(values.event_location ?? '') },
    ceremonies: Array.isArray(values.ceremonies) ? values.ceremonies : String(values.ceremony_name ?? '').split(' · ').filter(Boolean).map((name) => ({ name })),
    contact: { value: String(values.contact ?? '') },
    qr: { available: true, url: String(values.rsvp_link ?? values.qr_code ?? '') },
    variables: Object.fromEntries(Object.entries(values).filter(([, value]) => typeof value === 'string')),
  };
}

export function validateInvitationLayout({ document, values = {}, safeMargin = 64 }) {
  const source = document?.schemaVersion === 1 || document?.schemaVersion === 2 ? document : { ...document, schemaVersion: 1 };
  const resolvedLayout = resolveDesignLayout(source, layoutSnapshot(values));
  const errors = resolvedLayout.errors.map((issue) => ({ code: issue.code, layerId: issue.elementId, message: issue.message }));
  const warnings = resolvedLayout.warnings.map((issue) => ({ code: issue.code, layerId: issue.elementId }));
  for (const layer of Array.isArray(document.elements) ? document.elements : []) {
    if (layer.type !== 'TEXT' || !(layer.hideWhenEmpty || layer.binding === 'guest.table' || /\{\{\s*table_name\s*\}\}/i.test(String(layer.text ?? '')))) continue;
    const value = layer.binding === 'guest.table' ? values.table_name ?? values.tablename ?? values.tableName : [...String(layer.text ?? '').matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g)].map(([, key]) => values[key] ?? '').join('');
    if (!String(value ?? '').trim()) warnings.push({ code: 'OPTIONAL_FIELD_HIDDEN', layerId: layer.id });
  }
  for (const variable of Array.isArray(document.variables) ? document.variables : []) {
    if (variable.required && !String(values[variable.key] ?? variable.defaultValue ?? '').trim()) errors.push({ code: 'MISSING_REQUIRED_VARIABLE', message: `${variable.label ?? variable.key} est requis.` });
  }
  const canvas = resolvedLayout.canvas;
  const margins = typeof safeMargin === 'number' ? { top: safeMargin, right: safeMargin, bottom: safeMargin, left: safeMargin } : safeMargin;
  const boxes = [];
  for (const layer of resolvedLayout.elements) {
    if (layer.type === 'TEXT') {
      if (!String(layer.resolvedText ?? '').trim() && layer.binding) warnings.push({ code: 'OPTIONAL_FIELD_HIDDEN', layerId: layer.sourceElementId ?? layer.id });
      if (['GUEST_NAME', 'TABLE_INFO', 'EVENT_TITLE', 'COUPLE_NAMES'].includes(String(layer.role)) && (layer.x < margins.left || layer.y < margins.top || layer.x + layer.width > canvas.width - margins.right || layer.y + layer.height > canvas.height - margins.bottom || layer.role === 'GUEST_NAME' && layer.y + layer.height > canvas.height * 0.85)) {
        if (!errors.some((issue) => issue.code === 'OUTSIDE_SAFE_AREA' && issue.layerId === layer.id)) errors.push({ code: 'OUTSIDE_SAFE_AREA', layerId: layer.id, message: `${layer.name ?? 'Un bloc essentiel'} dépasse la marge de sécurité.` });
      }
      if (['GUEST_NAME', 'TABLE_INFO', 'EVENT_TITLE', 'COUPLE_NAMES'].includes(String(layer.role))) boxes.push({ ...layer, essential: true });
    } else if (layer.type === 'QR') {
      const size = Math.min(Number(layer.width), Number(layer.height));
      if (size < Number(layer.minSize ?? 96)) errors.push({ code: 'QR_TOO_SMALL', layerId: layer.id, message: 'La zone QR est trop petite pour rester lisible.' });
      if (size > Number(layer.maxSize ?? 512)) errors.push({ code: 'QR_TOO_LARGE', layerId: layer.id, message: 'La zone QR dépasse la taille maximale du modèle.' });
      boxes.push({ ...layer, qr: true });
    } else if (layer.type === 'IMAGE') boxes.push({ ...layer, image: true });
  }
  for (const box of boxes.filter((entry) => entry.qr)) for (const other of boxes.filter((entry) => entry !== box && (entry.essential || entry.image))) {
    if (overlaps(box, other, 12)) errors.push({ code: 'CRITICAL_COLLISION', layerId: other.id, otherLayerId: box.id, message: `${other.name ?? 'Un élément'} chevauche le QR.` });
  }
  for (const box of boxes.filter((entry) => entry.essential)) for (const image of boxes.filter((entry) => entry.image)) {
    if (overlaps(box, image, 12)) errors.push({ code: 'CRITICAL_COLLISION', layerId: box.id, otherLayerId: image.id, message: `${box.name ?? 'Un champ essentiel'} chevauche la photo.` });
  }
  return { errors, warnings, resolvedLayout };
}
