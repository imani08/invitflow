import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isValidReportResourceId, REPORT_RESOURCE_ID_PATTERN } from '../../../lib/report-resource-id.mjs';

test('report resource ID follows the strict backend UUID structure', async () => {
  const valid = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(isValidReportResourceId(valid), true);
  assert.equal(isValidReportResourceId(valid.toUpperCase()), true);
  assert.equal(isValidReportResourceId('550e8400e29b41d4a716446655440000'), false);
  assert.equal(isValidReportResourceId('550e8400-e29b-01d4-a716-446655440000'), false);
  assert.equal(isValidReportResourceId('550e8400-e29b-41d4-7716-446655440000'), false);
  assert.doesNotMatch(REPORT_RESOURCE_ID_PATTERN, /\[[^\]]*-\]/);

  const backend = await readFile(new URL('../../../../../../services/audit/src/audit.service.ts', import.meta.url), 'utf8');
  assert.match(backend, /\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[1-8\]\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}/i);
});

test('report form displays backend error messages and keeps the proxy response status/body', async () => {
  const form = await readFile(new URL('./report-form.tsx', import.meta.url), 'utf8');
  const route = await readFile(new URL('../../api/moderation/reports/route.ts', import.meta.url), 'utf8');
  assert.match(form, /Array\.isArray\(responseMessage\)/);
  assert.match(form, /Saisissez un identifiant UUID valide/);
  assert.match(route, /NextResponse\.json\(await response\.json\(\)\.catch\(\(\) => \(\{ error: 'invalid_moderation_response' \}\)\), \{ status: response\.status/);
  assert.match(route, /'idempotency-key': rawKey/);
  assert.match(route, /request\.headers\.get\('origin'\) !== expectedOrigin/);
});
