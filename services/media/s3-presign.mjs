import { createHash, createHmac } from 'node:crypto';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

export function createBoundedPostUpload({
  endpoint,
  bucket,
  key,
  contentType,
  maxBytes,
  region,
  accessKey,
  secretKey,
  now = new Date(),
  expiresInSeconds = 300,
}) {
  if (
    !(endpoint instanceof URL) ||
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new TypeError('A clean HTTP(S) storage endpoint is required');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
    throw new TypeError('A valid object bucket is required');
  if (!/^[a-z0-9-]+\/[0-9a-f-]{36}$/i.test(key))
    throw new TypeError('A namespaced UUID object key is required');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(contentType))
    throw new TypeError('A supported image content type is required');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 5 * 1024 * 1024)
    throw new TypeError('Upload size must be at most 5 MiB');
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 600)
    throw new TypeError('Upload policy expiry must not exceed 10 minutes');
  if (typeof region !== 'string' || !/^[a-z0-9-]{1,32}$/.test(region) || !accessKey || !secretKey)
    throw new TypeError('Complete S3 credentials and region are required');

  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = date.slice(0, 8);
  const credential = `${accessKey}/${day}/${region}/s3/aws4_request`;
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();
  const policy = {
    expiration: expiresAt,
    conditions: [
      { bucket },
      ['eq', '$key', key],
      ['eq', '$Content-Type', contentType],
      ['content-length-range', 1, maxBytes],
      { 'x-amz-algorithm': 'AWS4-HMAC-SHA256' },
      { 'x-amz-credential': credential },
      { 'x-amz-date': date },
    ],
  };
  const encodedPolicy = Buffer.from(JSON.stringify(policy)).toString('base64');
  const dateKey = hmac(`AWS4${secretKey}`, day);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(encodedPolicy).digest('hex');
  const target = new URL(endpoint.toString());
  target.pathname = `${target.pathname.replace(/\/$/, '')}/${bucket}`;
  return Object.freeze({
    url: target.toString(),
    method: 'POST',
    fields: Object.freeze({
      key,
      'Content-Type': contentType,
      'x-amz-algorithm': 'AWS4-HMAC-SHA256',
      'x-amz-credential': credential,
      'x-amz-date': date,
      policy: encodedPolicy,
      'x-amz-signature': signature,
    }),
    expiresInSeconds,
  });
}

export function createSignedGetDownload({
  endpoint,
  bucket,
  key,
  region,
  accessKey,
  secretKey,
  now = new Date(),
  expiresInSeconds = 300,
}) {
  if (
    !(endpoint instanceof URL) ||
    !['http:', 'https:'].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new TypeError('A clean HTTP(S) storage endpoint is required');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
    throw new TypeError('A valid object bucket is required');
  if (!/^assets\/[0-9a-f-]{36}(?:\/(?:preview|thumbnail))?$/i.test(key))
    throw new TypeError('A ready asset UUID key is required');
  if (typeof region !== 'string' || !/^[a-z0-9-]{1,32}$/.test(region) || !accessKey || !secretKey)
    throw new TypeError('Complete S3 credentials and region are required');
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 600)
    throw new TypeError('Download URL expiry must not exceed 10 minutes');

  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = date.slice(0, 8);
  const scope = `${day}/${region}/s3/aws4_request`;
  const target = new URL(endpoint.toString());
  target.pathname = `${target.pathname.replace(/\/$/, '')}/${awsEncode(bucket)}/${key.split('/').map(awsEncode).join('/')}`;
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': date,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${awsEncode(name)}=${awsEncode(value)}`)
    .join('&');
  const canonicalRequest = `GET\n${target.pathname}\n${canonicalQuery}\nhost:${target.host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha256(canonicalRequest)}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), 's3'), 'aws4_request');
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  target.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return Object.freeze({
    url: target.toString(),
    method: 'GET',
    headers: Object.freeze({}),
    expiresInSeconds,
  });
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}
