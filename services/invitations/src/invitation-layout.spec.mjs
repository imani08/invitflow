import assert from 'node:assert/strict';
import test from 'node:test';
import { fitInvitationText, validateInvitationLayout } from './invitation-layout.mjs';

const names = ['Jean', 'Grâce Mukendi', 'Monsieur et Madame Jean-Baptiste Ilunga Kalumuna', 'Monsieur et Madame Jean-Baptiste Ilunga Kalumuna et famille'];

test('fits short, medium and long guest names using deterministic multiline text', () => {
  const layer = { id: 'guest', name: 'Nom invité', role: 'GUEST_NAME', x: 100, y: 400, width: 880, height: 180, paddingX: 64, fontSize: 48, minFontSize: 24, maxFontSize: 48, maxLines: 3, lineHeight: 1.15 };
  const fits = names.map((name) => fitInvitationText(layer, name));
  assert.ok(fits.every((item) => !item.overflow));
  assert.equal(fits[0].fontSize, 48);
  assert.ok(fits.at(-1).fontSize < 48);
  assert.ok(fits.at(-1).lines.length > 1);
});

test('hides absent table fields, reports oversized text and catches safe-area and QR collisions', () => {
  const document = { canvas: { width: 1080, height: 1920 }, elements: [
    { id: 'guest', type: 'TEXT', role: 'GUEST_NAME', name: 'Invité', text: '{{guest_name}}', x: 80, y: 1650, width: 500, height: 70, fontSize: 30, minFontSize: 28, maxFontSize: 30, maxLines: 1 },
    { id: 'table', type: 'TEXT', role: 'TABLE_INFO', name: 'Table', text: '{{table_name}}', x: 0, y: 100, width: 450, height: 30, fontSize: 24, minFontSize: 20, maxFontSize: 24, maxLines: 1, hideWhenEmpty: true },
    { id: 'qr', type: 'QR', name: 'QR', x: 520, y: 1640, width: 100, height: 100, minSize: 96 },
  ] };
  const result = validateInvitationLayout({ document, values: { guest_name: names.at(-1), table_name: '' }, safeMargin: 64 });
  assert.ok(result.warnings.some((warning) => warning.code === 'OPTIONAL_FIELD_HIDDEN'));
  assert.ok(result.errors.some((error) => error.code === 'TEXT_OVERFLOW'));
  assert.ok(result.errors.some((error) => error.code === 'OUTSIDE_SAFE_AREA'));
  assert.ok(result.errors.some((error) => error.code === 'CRITICAL_COLLISION'));
});

test('reports QR minimum size and text safe-area errors explicitly', () => {
  const result = validateInvitationLayout({ document: { canvas: { width: 600, height: 800 }, elements: [
    { id: 'qr', type: 'QR', x: 500, y: 700, width: 60, height: 60 },
    { id: 'title', type: 'TEXT', role: 'EVENT_TITLE', name: 'Titre', text: 'Cérémonie', x: 10, y: 10, width: 400, height: 50, fontSize: 24 },
  ] }, safeMargin: 40 });
  assert.ok(result.errors.some((error) => error.code === 'QR_TOO_SMALL'));
  assert.ok(result.errors.some((error) => error.code === 'OUTSIDE_SAFE_AREA'));
});
