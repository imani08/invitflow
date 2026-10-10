import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('quarantine bucket CORS is scoped to the configured web origin', async () => {
  const cors = await readFile(new URL('./media-cors.xml', import.meta.url), 'utf8');
  const bootstrap = await readFile(new URL('./bootstrap.sh', import.meta.url), 'utf8');
  const compose = await readFile(new URL('../../compose.yaml', import.meta.url), 'utf8');
  const minio = compose.split('  minio:\n')[1]?.split('\n  minio-bootstrap:')[0] ?? '';

  assert.match(cors, /<AllowedOrigin>__WEB_ORIGIN__<\/AllowedOrigin>/);
  assert.doesNotMatch(cors, /<AllowedOrigin>\*<\/AllowedOrigin>/);
  assert.match(bootstrap, /web_origin=\$\{WEB_ORIGIN:-http:\/\/localhost:3000\}/);
  assert.match(bootstrap, /sed "s\|__WEB_ORIGIN__\|\$web_origin\|g"/);
  assert.match(compose, /WEB_ORIGIN: \$\{WEB_ORIGIN:-http:\/\/localhost:3000\}/);
  assert.match(minio, /MINIO_API_CORS_ALLOW_ORIGIN: \$\{WEB_ORIGIN:-http:\/\/localhost:3000\}/);
  assert.match(cors, /<AllowedMethod>POST<\/AllowedMethod>/);
  assert.match(cors, /<AllowedHeader>Content-Type<\/AllowedHeader>/);
  assert.match(cors, /<ExposeHeader>ETag<\/ExposeHeader>/);
});
