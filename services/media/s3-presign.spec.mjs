import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { createBoundedPostUpload, createSignedGetDownload } from './s3-presign.mjs';

test('creates a five minute POST policy constrained to exact key, MIME and declared maximum size', () => {
  const result = createBoundedPostUpload({
    endpoint: new URL('http://localhost:9000'),
    bucket: 'media-quarantine',
    key: 'incoming/550e8400-e29b-41d4-a716-446655440000',
    contentType: 'image/png',
    maxBytes: 2_000_000,
    region: 'us-east-1',
    accessKey: 'media-user',
    secretKey: 'local-secret',
    now: new Date('2026-09-30T12:00:00.000Z'),
  });
  const policy = JSON.parse(Buffer.from(result.fields.policy, 'base64').toString('utf8'));
  assert.equal(result.method, 'POST');
  assert.equal(result.url, 'http://localhost:9000/media-quarantine');
  assert.equal(result.expiresInSeconds, 300);
  assert.equal(policy.expiration, '2026-09-30T12:05:00.000Z');
  assert.ok(
    policy.conditions.some(
      (condition) =>
        Array.isArray(condition) &&
        condition[0] === 'content-length-range' &&
        condition[1] === 1 &&
        condition[2] === 2_000_000,
    ),
  );
  assert.ok(
    policy.conditions.some(
      (condition) =>
        Array.isArray(condition) &&
        condition[0] === 'eq' &&
        condition[1] === '$key' &&
        condition[2] === 'incoming/550e8400-e29b-41d4-a716-446655440000',
    ),
  );
  assert.ok(
    policy.conditions.some(
      (condition) =>
        Array.isArray(condition) &&
        condition[0] === 'eq' &&
        condition[1] === '$Content-Type' &&
        condition[2] === 'image/png',
    ),
  );
  assert.match(result.fields['x-amz-signature'], /^[0-9a-f]{64}$/);
});

test('rejects unsafe storage targets, keys, content types and unbounded upload limits', () => {
  const base = {
    endpoint: new URL('http://localhost:9000'),
    bucket: 'media-quarantine',
    key: 'incoming/550e8400-e29b-41d4-a716-446655440000',
    contentType: 'image/png',
    maxBytes: 1024,
    region: 'us-east-1',
    accessKey: 'media-user',
    secretKey: 'local-secret',
  };
  assert.throws(
    () =>
      createBoundedPostUpload({ ...base, endpoint: new URL('http://user:pass@localhost:9000') }),
    /endpoint/,
  );
  assert.throws(() => createBoundedPostUpload({ ...base, key: 'incoming/../../other' }), /key/);
  assert.throws(
    () => createBoundedPostUpload({ ...base, contentType: 'image/svg+xml' }),
    /content type/,
  );
  assert.throws(() => createBoundedPostUpload({ ...base, maxBytes: 5 * 1024 * 1024 + 1 }), /size/);
});

test('signs short-lived downloads for sanitized ready assets only', () => {
  const result = createSignedGetDownload({
    endpoint: new URL('https://cdn.example.test/storage'),
    bucket: 'media-ready',
    key: 'assets/550e8400-e29b-41d4-a716-446655440000',
    region: 'us-east-1',
    accessKey: 'media-user',
    secretKey: 'local-secret',
    now: new Date('2026-09-30T12:00:00.000Z'),
  });
  const url = new URL(result.url);
  assert.equal(result.method, 'GET');
  assert.equal(result.expiresInSeconds, 300);
  assert.equal(
    url.origin + url.pathname,
    'https://cdn.example.test/storage/media-ready/assets/550e8400-e29b-41d4-a716-446655440000',
  );
  assert.equal(url.searchParams.get('X-Amz-Date'), '20260930T120000Z');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '300');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  const signature = url.searchParams.get('X-Amz-Signature');
  assert.match(signature, /^[0-9a-f]{64}$/);
  const query = [...url.searchParams.entries()]
    .filter(([name]) => name !== 'X-Amz-Signature')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(value).replaceAll('%2F', '%2F')}`,
    )
    .join('&');
  const canonical = `GET\n${url.pathname}\n${query}\nhost:${url.host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const scope = '20260930/us-east-1/s3/aws4_request';
  const stringToSign = `AWS4-HMAC-SHA256\n20260930T120000Z\n${scope}\n${createHash('sha256').update(canonical).digest('hex')}`;
  const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
  const signingKey = hmac(
    hmac(hmac(hmac('AWS4local-secret', '20260930'), 'us-east-1'), 's3'),
    'aws4_request',
  );
  assert.equal(signature, createHmac('sha256', signingKey).update(stringToSign).digest('hex'));
});

test('rejects download keys outside ready asset UUIDs and excessive expiry', () => {
  const base = {
    endpoint: new URL('http://localhost:9000'),
    bucket: 'media-ready',
    key: 'assets/550e8400-e29b-41d4-a716-446655440000',
    region: 'us-east-1',
    accessKey: 'media-user',
    secretKey: 'local-secret',
  };
  assert.throws(
    () => createSignedGetDownload({ ...base, key: 'sealed/550e8400-e29b-41d4-a716-446655440000' }),
    /ready asset UUID/,
  );
  assert.throws(() => createSignedGetDownload({ ...base, expiresInSeconds: 601 }), /10 minutes/);
});

test('permits only the fixed ready asset variants for signed downloads', () => {
  for (const variant of ['preview', 'thumbnail']) {
    const result = createSignedGetDownload({
      endpoint: new URL('https://cdn.example.test/storage'),
      bucket: 'media-ready',
      key: `assets/550e8400-e29b-41d4-a716-446655440000/${variant}`,
      region: 'us-east-1',
      accessKey: 'media-user',
      secretKey: 'local-secret',
      now: new Date('2026-09-30T12:00:00.000Z'),
    });
    assert.equal(
      new URL(result.url).pathname,
      `/storage/media-ready/assets/550e8400-e29b-41d4-a716-446655440000/${variant}`,
    );
  }
  assert.throws(
    () =>
      createSignedGetDownload({
        endpoint: new URL('https://cdn.example.test/storage'),
        bucket: 'media-ready',
        key: 'assets/550e8400-e29b-41d4-a716-446655440000/other',
        region: 'us-east-1',
        accessKey: 'media-user',
        secretKey: 'local-secret',
      }),
    /ready asset UUID/,
  );
});
