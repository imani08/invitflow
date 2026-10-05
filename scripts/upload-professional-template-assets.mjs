import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Explicit operator command. Uses the existing Media quarantine/validation/upload workflow.
const token = process.env.TEMPLATE_ASSET_TOKEN;
const base = process.env.MEDIA_BASE_URL ?? 'http://127.0.0.1:3002';
if (!token) throw new Error('TEMPLATE_ASSET_TOKEN must contain a local authenticated bearer token');
const bytes = await readFile(new URL('../docs/template-assets/botanical-branch-v1.png', import.meta.url));
async function api(path, body) {
  const response = await fetch(`${base.replace(/\/$/, '')}/v1/assets${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Media rejected ${path || 'creation'} (${response.status})`);
  return response.json();
}
const asset = await api('', { filename: 'botanical-branch-v1.png', mimeType: 'image/png', sizeBytes: bytes.length, purpose: 'BACKGROUND' });
const { upload } = await api(`/${asset.id}/upload-url`, {});
if (upload.method !== 'POST' || typeof upload.url !== 'string' || !upload.fields) throw new Error('Unexpected upload contract');
const form = new FormData();
for (const [key, value] of Object.entries(upload.fields)) form.append(key, value);
form.append('file', new Blob([bytes], { type: 'image/png' }), 'botanical-branch-v1.png');
const uploaded = await fetch(upload.url, { method: 'POST', body: form, signal: AbortSignal.timeout(120000) });
if (!uploaded.ok) throw new Error(`MinIO upload failed (${uploaded.status}); keep asset ${asset.id} for diagnosis`);
const ready = await api(`/${asset.id}/complete`, {});
if (ready.status !== 'READY' || !ready.width || !ready.height) throw new Error(`Asset ${asset.id} is not ready`);
const path = process.argv.find((arg) => arg.startsWith('--output='))?.slice(9) ?? join(tmpdir(), 'invitaflow-template-assets.json');
await writeFile(path, JSON.stringify({ botanicalBranch: { assetId: ready.id, width: ready.width, height: ready.height } }, null, 2));
console.info(`Private asset manifest written: ${path}`);
