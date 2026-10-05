import { readFileSync } from 'node:fs';
const base = JSON.parse(readFileSync(new URL('./portrait-two-ceremonies-v2.json', import.meta.url), 'utf8'));
const assetId = '550e8400-e29b-41d4-a716-446655440000';
const image = (id, role, zIndex, extra = {}) => ({ id, name: id, type: 'IMAGE', role, assetId, originalAssetId: assetId, x: 100, y: 420, width: 880, height: 900, rotation: 0, locked: false, editable: true, zIndex, sourceWidth: 3600, sourceHeight: 4800, fit: 'cover', cropScale: 1, cropX: 50, cropY: 50, opacity: 1, ...extra });
const background = image('background-photo', 'BACKGROUND', 10, { x: 0, y: 0, width: 1080, height: 1920, sourceWidth: 4800, sourceHeight: 6000 });
const foreground = image('main-photo', 'FOREGROUND', 50);
const decoration = image('ornament', 'DECORATION', 40, { x: 20, y: 400, width: 300, height: 300 });
const text = { ...base.elements.find((element) => element.id === 'guest'), zIndex: 70 };
const cases = {
  A: [background], B: [foreground], C: [background, foreground],
  D: [background, { ...foreground, maskId: 'watercolor-soft-01' }],
  E: [{ ...foreground, sourceWidth: 4800, sourceHeight: 2400, focalPoint: { x: 0.8, y: 0.3 } }],
  F: [{ ...foreground, width: 880, height: 440, sourceWidth: 2400, sourceHeight: 4800, focalPoint: { x: 0.5, y: 0.2 } }],
  G: [{ ...foreground, assetId: '550e8400-e29b-41d4-a716-446655440001', derivedAssetId: '550e8400-e29b-41d4-a716-446655440001', maskId: 'organic-portrait-01' }],
  H: [background, image('paper-texture', 'TEXTURE', 20, { x: 0, y: 0, width: 1080, height: 1920, opacity: 0.2 }), { ...foreground, blur: 2, overlay: { type: 'linear-gradient', angle: 90, opacity: 0.5, stops: [{ offset: 0, color: '#FFFFFF00' }, { offset: 1, color: '#32163A' }] } }],
  I: [decoration, foreground], J: [foreground, { ...decoration, zIndex: 60 }],
};
/** Synthetic fixture documents only; never seeded or exposed by production APIs. */
export function visualFixture(id) {
  if (!cases[id]) throw new TypeError('Unknown fixture');
  return { ...structuredClone(base), groups: [], elements: structuredClone([base.elements[0], ...cases[id], text]), metadata: { fixture: id } };
}
export const VISUAL_CASES = Object.freeze(Object.keys(cases));
