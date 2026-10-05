import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPrivateMediaPreview } from './private-media-preview.mjs';

test('private preview uses existing POST contract and returns a local blob', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    if (calls === 1) {
      assert.equal(init.method, 'POST'); assert.equal(init.body, '{}');
      assert.equal(String(url), '/api/assets/asset-id/download-url?variant=preview');
      return new Response(JSON.stringify({ download: { url: 'https://minio.example.test/signed' } }));
    }
    assert.equal(init.credentials, 'omit');
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } });
  };
  try { const url = await loadPrivateMediaPreview('asset-id'); assert.ok(url.startsWith('blob:')); URL.revokeObjectURL(url); }
  finally { globalThis.fetch = original; }
});
test('unavailable or executable previews fail closed', async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [new Response('{}', { status: 403 }), new Response(JSON.stringify({ download: { url: 'javascript:alert(1)' } }))]) {
      globalThis.fetch = async () => response;
      await assert.rejects(() => loadPrivateMediaPreview('asset-id'));
    }
  } finally { globalThis.fetch = original; }
});
