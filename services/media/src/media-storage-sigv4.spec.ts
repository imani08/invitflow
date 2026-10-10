import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { MediaStorage } from './media-storage.js';

const uuid = '338b9ae7-c68e-4219-87d8-557028ddfe49';
const accessKey = 'media-test-access';
const secretKey = 'unit-test-secret-not-a-credential';
const region = 'us-east-1';
const fixedDate = '2026-10-10T12:34:56.000Z';
  const realDate = globalThis.Date;

function configureTestStorage() {
  process.env['MINIO_ENDPOINT'] = 'http://minio:9000';
  process.env['MINIO_PUBLIC_ENDPOINT'] = 'http://localhost:9000';
  process.env['MINIO_MEDIA_QUARANTINE_BUCKET'] = 'media-quarantine';
  process.env['MINIO_MEDIA_BUCKET'] = 'media';
  process.env['MINIO_REGION'] = region;
  process.env['MINIO_MEDIA_ACCESS_KEY'] = accessKey;
  process.env['MINIO_MEDIA_SECRET_KEY'] = secretKey;
  process.env['MINIO_STORAGE_AUDIT_ACCESS_KEY'] = 'audit-test-access';
  process.env['MINIO_STORAGE_AUDIT_SECRET_KEY'] = 'audit-test-secret';
  globalThis.Date = class FixedDate extends realDate {
    constructor(...args: unknown[]) {
      super(args.length ? (args[0] as string | number) : fixedDate);
    }
    static override now() { return new realDate(fixedDate).getTime(); }
  } as DateConstructor;
}

function restoreDate() {
  globalThis.Date = realDate;
}

function hmac(key: Uint8Array | string, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function expectedSignature(method: string, path: string, payloadHash: string, host: string) {
  const amzDate = fixedDate.replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  // CanonicalHeaders ends with LF, followed by the required separator LF before SignedHeaders.
  const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${day}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), 's3'), 'aws4_request');
  return createHmac('sha256', signingKey).update(stringToSign).digest('hex');
}

test('server requests sign GET, HEAD, PUT and DELETE with path-style host and correct payload hash', async (context) => {
  configureTestStorage();
  context.after(restoreDate);
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  const operations = [
    { method: 'GET', bucket: 'media-quarantine', key: `incoming/${uuid}`, namespace: 'upload' },
    { method: 'HEAD', bucket: 'media-quarantine', key: `incoming/${uuid}`, namespace: 'upload' },
    { method: 'PUT', bucket: 'media', key: `assets/${uuid}`, namespace: 'ready', body: Buffer.from('verified-media-payload') },
    { method: 'DELETE', bucket: 'media', key: `assets/${uuid}`, namespace: 'ready' },
  ] as const;

  for (const operation of operations) {
    const body = 'body' in operation ? operation.body : undefined;
    let capturedUrl: URL | undefined;
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = async (input, init) => {
      capturedUrl = new URL(input instanceof Request ? input.url : String(input));
      capturedInit = init;
      return new Response(null, { status: 200 });
    };
    const storage = new MediaStorage();
    const request = (storage as unknown as { request: (...args: unknown[]) => Promise<Response> }).request;
    await request.call(storage, operation.method, operation.bucket, operation.key, false, operation.namespace, body);

    assert.ok(capturedUrl);
    assert.equal(capturedUrl.host, 'minio:9000');
    assert.equal(capturedUrl.pathname, `/${operation.bucket}/${operation.key}`);
    assert.equal(capturedInit?.method, operation.method);
    const headers = new Headers(capturedInit?.headers);
    const payload = body ?? new Uint8Array();
    const payloadHash = createHash('sha256').update(payload).digest('hex');
    assert.equal(headers.get('x-amz-content-sha256'), payloadHash);
    assert.equal(headers.get('x-amz-date'), '20261010T123456Z');
    assert.equal(headers.get('authorization')?.match(/SignedHeaders=([^,]+)/)?.[1], 'host;x-amz-content-sha256;x-amz-date');
    assert.equal(headers.get('authorization')?.match(/Signature=([0-9a-f]{64})/)?.[1], expectedSignature(operation.method, capturedUrl.pathname, payloadHash, capturedUrl.host));
    if (body) assert.deepEqual(Buffer.from(capturedInit?.body as Uint8Array), body);
  }
});

test('storage diagnostics identify S3 codes without logging secrets or signatures', async (context) => {
  configureTestStorage();
  context.after(restoreDate);
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const storage = new MediaStorage();
  const logLines: string[] = [];
  const logger = (storage as unknown as { logger: { error: (message: string) => void } }).logger;
  const originalLog = logger.error;
  logger.error = (message) => logLines.push(message);
  context.after(() => { logger.error = originalLog; });
  globalThis.fetch = async () => new Response('<Error><Code>SignatureDoesNotMatch</Code><Message>private server text</Message></Error>', { status: 403 });

  const request = (storage as unknown as { request: (...args: unknown[]) => Promise<Response> }).request;
  await assert.rejects(
    request.call(storage, 'HEAD', 'media-quarantine', `incoming/${uuid}`, false, 'upload'),
    (error: unknown) => {
      assert.match(String(error), /Media object storage is unavailable/);
      assert.doesNotMatch(String(error), new RegExp(secretKey));
      return true;
    },
  );
  assert.match(logLines.join('\n'), /SignatureDoesNotMatch/);
  assert.match(logLines.join('\n'), /HTTP 403/);
  assert.doesNotMatch(logLines.join('\n'), new RegExp(secretKey));
  assert.doesNotMatch(logLines.join('\n'), /Authorization|Signature=[0-9a-f]{64}|private server text/);
});

const integrationEnabled = process.env['MEDIA_MINIO_INTEGRATION'] === '1';
test('real MinIO accepts upload, HEAD, GET, PUT and DELETE signatures', { skip: !integrationEnabled }, async () => {
  const storage = new MediaStorage();
  const uploadId = randomUUID();
  const readyId = randomUUID();
  const uploadKey = `incoming/${uploadId}`;
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO6sAAAAASUVORK5CYII=', 'base64');
  const post = await storage.createUploadUrl(uploadKey, 'image/png', bytes.length + 16, 300);
  const form = new FormData();
  for (const [name, value] of Object.entries(post.fields)) form.append(name, value);
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'integration.png');

  try {
    const upload = await fetch(post.url, { method: 'POST', body: form });
    assert.equal(upload.ok, true, `signed POST failed with HTTP ${upload.status}`);
    assert.equal((await storage.headQuarantine(uploadKey)).size, bytes.length);
    assert.deepEqual(await storage.readQuarantine(uploadKey, bytes.length + 1), bytes);
    await storage.publishSanitized(readyId, bytes);
    assert.deepEqual(await storage.readReady(`assets/${readyId}`, bytes.length + 1), bytes);
  } finally {
    await Promise.allSettled([storage.deleteQuarantine(uploadKey), storage.deleteReady(`assets/${readyId}`)]);
  }
});
