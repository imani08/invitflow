import { fitInvitationText } from './index.mjs';
export const EDITORIAL_BINDINGS = Object.freeze(['event.invitationText']);
export function editorialField(document, elementId) {
  const declaration = document.metadata?.editorialFields?.find(field => field.elementId === elementId);
  const layer = document.elements?.find(element => element.id === elementId && element.type === 'TEXT');
  if (!declaration || !layer || !EDITORIAL_BINDINGS.includes(declaration.binding) || layer.binding !== declaration.binding) throw new TypeError('Editorial field is not explicitly eligible');
  return layer;
}
export function editorialTarget(layer, text, level = 'BALANCED') {
  if (!['LIGHT', 'BALANCED', 'CONCISE'].includes(level)) throw new TypeError('Invalid compression level');
  const fitted = fitInvitationText(layer, text);
  let low = 1, high = Math.max(text.length, 1);
  while (low < high) { const mid = Math.ceil((low + high) / 2); if (fitInvitationText(layer, text.slice(0, mid)).overflow) high = mid - 1; else low = mid; }
  const ratio = level === 'LIGHT' ? 0.85 : level === 'BALANCED' ? 0.68 : Math.min(0.6, low / Math.max(text.length, 1));
  return { overflow: fitted.overflow, maxCharacters: Math.max(1, Math.floor(text.length * ratio)), maxEstimatedLines: Math.max(1, Math.min(30, Number.isFinite(layer.maxLines) ? layer.maxLines : 4)), targetReductionRatio: 1 - ratio, layoutCapacity: low };
}
export function protectedEditorialTerms(text, supplied = []) {
  if (!Array.isArray(supplied) || supplied.length > 50 || supplied.some(term => typeof term !== 'string' || !term || term.length > 1000 || !text.includes(term))) throw new TypeError('Invalid protected fragments');
  const detected = text.match(/https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d[\d\s:/.+()-]*\d\b|\b\d+\b|\b\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}\b/gi) ?? [];
  const dates = text.match(/\b\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b|\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi) ?? [];
  const addresses = text.match(/\b(?:avenue|rue|boulevard|street|road)\s+[^\n.!?]{1,120}/gi) ?? [];
  return [...new Set([...supplied, ...detected, ...dates, ...addresses])].sort((a,b) => b.length - a.length);
}
export function redactEditorial(text, protectedTerms) {
  if (/__IF_PROTECTED_/.test(text)) throw new TypeError('Reserved editorial placeholder');
  const fragments = [];
  const order = [];
  const terms = [...new Set(protectedTerms)].sort((a, b) => b.length - a.length);
  if (!terms.length) return { text, fragments, order };
  const pattern = new RegExp(terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  // Match only the original input: short numeric terms must never rewrite generated placeholders.
  const masked = text.replace(pattern, term => {
    let fragment = fragments.find(entry => entry.term === term);
    if (!fragment) { fragment = { token: '__IF_PROTECTED_' + fragments.length + '__', term, count: 0 }; fragments.push(fragment); }
    fragment.count++;
    order.push(fragment.token);
    return fragment.token;
  });
  return { text: masked, fragments, order };
}
export function restoreEditorial(text, fragments, expectedOrder) {
  if (typeof text !== 'string' || !text.trim()) throw new TypeError('empty_response');
  const actualOrder = text.match(/__IF_PROTECTED_\d+__/g) ?? [];
  if (actualOrder.length !== expectedOrder.length || actualOrder.some((token, index) => token !== expectedOrder[index])) throw new TypeError('REJECTED_PROPOSAL');
  for (const { token, term, count } of fragments) { if (text.split(token).length - 1 !== count) throw new TypeError('REJECTED_PROPOSAL'); text = text.split(token).join(term); }
  if (/__IF_PROTECTED_/.test(text)) throw new TypeError('REJECTED_PROPOSAL');
  return text.trim();
}
export function validateEditorialProposal(sourceText, proposedText, protectedTerms, target) {
  if (typeof proposedText !== 'string' || !proposedText.trim()) throw new TypeError('empty_response');
  if (proposedText.length >= sourceText.length) throw new TypeError('not_shorter');
  if (protectedTerms.some(term => proposedText.split(term).length !== sourceText.split(term).length)) throw new TypeError('REJECTED_PROPOSAL');
  if (protectedEditorialTerms(proposedText).some(term => !sourceText.includes(term))) throw new TypeError('REJECTED_PROPOSAL');
  if (proposedText.length > target.maxCharacters) throw new TypeError('target_exceeded');
  return proposedText;
}
export function applyEditorialSelection(document, elementId, selectedText, provenance) {
  editorialField(document, elementId);
  if (typeof selectedText !== 'string' || !selectedText.trim() || selectedText.length > 12000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001f\u007f]/.test(selectedText)) throw new TypeError('Invalid editorial text');
  const next = structuredClone(document);
  next.metadata.editorialOverrides = { ...(next.metadata.editorialOverrides ?? {}), [elementId]: { selectedText, ...provenance } };
  return next;
}
