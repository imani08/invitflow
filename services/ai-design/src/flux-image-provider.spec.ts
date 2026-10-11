import assert from 'node:assert/strict';
import test from 'node:test';
import { FluxImageProvider } from './flux-image-provider.js';

test('FLUX follows the klein API contract, polls an existing task and downloads without sending the key', async () => {
  const previousFetch = globalThis.fetch; const previousKey = process.env['BFL_API_KEY'];
  process.env['BFL_API_KEY'] = 'test-only-key';
  const calls: string[] = []; const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.writeUInt32BE(768, 16); png.writeUInt32BE(1024, 20);
  try {
    globalThis.fetch = async (url, init) => {
      calls.push(String(url));
      if (calls.length === 1) {
        assert.equal(String(url), 'https://api.bfl.ai/v1/flux-2-klein-9b');
        assert.equal(new Headers(init?.headers).get('x-key'), 'test-only-key');
        const body = JSON.parse(String(init?.body)); assert.equal(body.output_format, 'png'); assert.match(body.prompt, /No text/);
        return Response.json({ id: 'task-1', polling_url: 'https://api.bfl.ai/v1/get_result?id=task-1' });
      }
      if (calls.length === 2) return Response.json({ status: 'Ready', result: { sample: 'https://delivery-eu1.bfl.ai/image.png?temporary=1' } });
      assert.equal(new Headers(init?.headers).get('x-key'), null);
      return new Response(png);
    };
    const provider = new FluxImageProvider(); const task = await provider.submit('Décor botanique');
    assert.equal(task.id, 'task-1'); assert.deepEqual(await provider.result(task), png);
    assert.equal(calls.filter(url => url.endsWith('/flux-2-klein-9b')).length, 1);
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env['BFL_API_KEY']; else process.env['BFL_API_KEY'] = previousKey; }
});

test('FLUX rejects missing keys, unknown polling origins and external result hosts', async () => {
  const previousFetch = globalThis.fetch; const previousKey = process.env['BFL_API_KEY'];
  const provider = new FluxImageProvider();
  try {
    delete process.env['BFL_API_KEY']; await assert.rejects(provider.submit('Décor'), /incertain|configuré/);
    process.env['BFL_API_KEY'] = 'test-only-key';
    await assert.rejects(provider.result({ id: 'task', pollingUrl: 'http://localhost:9000' }), /invalide/);
    globalThis.fetch = async () => Response.json({ status: 'Ready', result: { sample: 'https://attacker.example/image.png' } });
    await assert.rejects(provider.result({ id: 'task', pollingUrl: 'https://api.bfl.ai/v1/get_result?id=task' }), /non autorisée/);
  } finally { globalThis.fetch = previousFetch; if (previousKey === undefined) delete process.env['BFL_API_KEY']; else process.env['BFL_API_KEY'] = previousKey; }
});
