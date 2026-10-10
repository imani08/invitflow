import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { createBoundedPostUpload, createSignedGetDownload } from '../s3-presign.mjs';
import { requiredEnv } from './env.js';

const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Uint8Array | string, value: string) =>
  createHmac('sha256', key).update(value).digest();
const safeS3ErrorCodes = new Set([
  'SignatureDoesNotMatch', 'AccessDenied', 'NoSuchKey', 'NoSuchBucket',
  'InvalidAccessKeyId', 'RequestTimeTooSkewed',
]);

function safeS3ErrorCode(responseBody: string) {
  const code = responseBody.match(/<Code>([^<]{1,64})<\/Code>/)?.[1];
  return code && safeS3ErrorCodes.has(code) ? code : 'S3RequestRejected';
}

@Injectable()
export class MediaStorage {
  private readonly logger = new Logger(MediaStorage.name);
  private readonly endpoint = new URL(requiredEnv('MINIO_ENDPOINT', 'http://minio:9000'));
  private readonly publicEndpoint = new URL(
    requiredEnv('MINIO_PUBLIC_ENDPOINT', 'http://localhost:9000'),
  );
  private readonly quarantineBucket = requiredEnv(
    'MINIO_MEDIA_QUARANTINE_BUCKET',
    'media-quarantine',
  );
  private readonly bucket = requiredEnv('MINIO_MEDIA_BUCKET', 'media');
  private readonly region = requiredEnv('MINIO_REGION', 'us-east-1');
  private readonly accessKey = requiredEnv('MINIO_MEDIA_ACCESS_KEY');
  private readonly secretKey = requiredEnv('MINIO_MEDIA_SECRET_KEY');
  private readonly inventoryAccessKey = requiredEnv('MINIO_STORAGE_AUDIT_ACCESS_KEY');
  private readonly inventorySecretKey = requiredEnv('MINIO_STORAGE_AUDIT_SECRET_KEY');

  async listBucketObjects(bucket: string, maxObjects = 100_000) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || !Number.isInteger(maxObjects) || maxObjects < 1 || maxObjects > 500_000)
      throw new ServiceUnavailableException('Storage inventory parameters are invalid');
    const objects: Array<{ key: string; sizeBytes: number }> = [];
    let continuationToken: string | undefined;
    let truncated = false;
    do {
      const target = new URL(this.endpoint.toString());
      target.pathname = `${target.pathname.replace(/\/$/, '')}/${awsEncode(bucket)}`;
      const params = new URLSearchParams([['list-type', '2']]);
      if (continuationToken) params.set('continuation-token', continuationToken);
      target.search = canonicalQuery(params);
      const response = await this.signedInventoryGet(target);
      const xml = await response.text();
      const page = parseListObjectsPage(xml);
      for (const object of page.objects) {
        objects.push(object);
        if (objects.length >= maxObjects && page.isTruncated) { truncated = true; break; }
      }
      if (truncated || !page.isTruncated) break;
      if (!page.nextContinuationToken || page.nextContinuationToken === continuationToken)
        throw new ServiceUnavailableException('MinIO returned an invalid inventory continuation token');
      continuationToken = page.nextContinuationToken;
    } while (true);
    return { objects, complete: !truncated, truncated };
  }

  private async signedInventoryGet(target: URL) {
    const payloadHash = sha256(new Uint8Array());
    const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = now.slice(0, 8);
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders = `host:${target.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${now}\n`;
    const canonicalRequest = `GET\n${target.pathname}\n${target.search.slice(1)}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const scope = `${day}/${this.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${now}\n${scope}\n${sha256(canonicalRequest)}`;
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.inventorySecretKey}`, day), this.region), 's3'), 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    let response: Response;
    try {
      response = await fetch(target, { headers: {
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': now,
        authorization: `AWS4-HMAC-SHA256 Credential=${this.inventoryAccessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      }, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      const errorName = error instanceof Error && /^[A-Za-z]+Error$/.test(error.name) ? error.name : 'NetworkError';
      this.logger.error(`MinIO inventory GET failed: network error (${errorName}).`);
      throw new ServiceUnavailableException('MinIO inventory is unavailable');
    }
    if (response.ok) return response;
    const errorCode = safeS3ErrorCode(await response.text().catch(() => ''));
    this.logger.error(`MinIO inventory GET rejected: ${errorCode} (HTTP ${response.status}).`);
    throw new ServiceUnavailableException('MinIO inventory is unavailable');
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    maxBytes: number,
    expiresInSeconds: number,
  ) {
    return createBoundedPostUpload({
      endpoint: this.publicEndpoint,
      bucket: this.quarantineBucket,
      key,
      contentType,
      maxBytes,
      region: this.region,
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      expiresInSeconds,
    });
  }

  async createDownloadUrl(key: string) {
    if (!/^assets\/[0-9a-f-]{36}(?:\/(?:preview|thumbnail))?$/i.test(key))
      throw new ServiceUnavailableException('Media download key is invalid');
    await this.request('HEAD', this.bucket, key, false, 'ready');
    return this.presign('GET', this.bucket, key);
  }

  async headQuarantine(key: string) {
    const response = await this.request(
      'HEAD',
      this.quarantineBucket,
      key,
      false,
      key.startsWith('sealed/') ? 'quarantine' : 'upload',
    );
    const size = Number(response.headers.get('content-length'));
    const contentType =
      response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    if (!Number.isSafeInteger(size) || size < 1)
      throw new ServiceUnavailableException('Uploaded media metadata is invalid');
    return { size, contentType };
  }

  async readQuarantine(key: string, maxBytes: number) {
    const response = await this.request(
      'GET',
      this.quarantineBucket,
      key,
      false,
      key.startsWith('sealed/') ? 'quarantine' : 'upload',
    );
    const announced = Number(response.headers.get('content-length'));
    if (Number.isFinite(announced) && announced > maxBytes)
      throw new ServiceUnavailableException('Uploaded media exceeds its reserved size');
    if (!response.body) throw new ServiceUnavailableException('Uploaded media body is unavailable');
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new ServiceUnavailableException('Uploaded media exceeds its reserved size');
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, size);
  }

  async readReady(key: string, maxBytes: number) {
    if (!/^assets\/[0-9a-f-]{36}$/i.test(key))
      throw new ServiceUnavailableException('Media read key is invalid');
    const response = await this.request('GET', this.bucket, key, false, 'ready');
    const announced = Number(response.headers.get('content-length'));
    if (Number.isFinite(announced) && announced > maxBytes)
      throw new ServiceUnavailableException('Ready media exceeds the read limit');
    if (!response.body) throw new ServiceUnavailableException('Ready media body is unavailable');
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new ServiceUnavailableException('Ready media exceeds the read limit');
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, size);
  }

  async deleteQuarantine(key: string) {
    await this.request(
      'DELETE',
      this.quarantineBucket,
      key,
      true,
      key.startsWith('sealed/') ? 'quarantine' : 'upload',
    );
  }

  async publishSanitized(assetId: string, bytes: Buffer) {
    const key = `assets/${assetId}`;
    await this.request('PUT', this.bucket, key, false, 'ready', bytes, 'image/webp');
    return key;
  }

  async publishDerivedPng(assetId: string, bytes: Buffer) {
    if (!/^[0-9a-f-]{36}$/i.test(assetId)) throw new ServiceUnavailableException('Derived media id is invalid');
    const key = `assets/${assetId}`;
    await this.request('PUT', this.bucket, key, false, 'ready', bytes, 'image/png');
    return key;
  }

  async publishVariant(assetId: string, variant: 'preview' | 'thumbnail', bytes: Buffer) {
    const key = `assets/${assetId}/${variant}`;
    await this.request('PUT', this.bucket, key, false, 'ready', bytes, 'image/webp');
    return key;
  }

  async deleteVariants(assetId: string) {
    await Promise.all([
      this.deleteReady(`assets/${assetId}/preview`),
      this.deleteReady(`assets/${assetId}/thumbnail`),
    ]);
  }

  async deleteReady(key: string) {
    await this.request('DELETE', this.bucket, key, true, 'ready');
  }

  private presign(method: 'GET', bucket: string, key: string) {
    if (method !== 'GET' || bucket !== this.bucket)
      throw new ServiceUnavailableException('Media download target is invalid');
    return createSignedGetDownload({
      endpoint: this.publicEndpoint,
      bucket,
      key,
      region: this.region,
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      expiresInSeconds: 300,
    });
  }

  private async request(
    method: 'HEAD' | 'GET' | 'PUT' | 'DELETE',
    bucket: string,
    key: string,
    missingOk = false,
    namespace: 'upload' | 'quarantine' | 'ready' = 'quarantine',
    body?: Buffer,
    contentType = 'application/octet-stream',
  ) {
    const target = this.objectUrl(this.endpoint, bucket, key, namespace);
    const payloadHash = sha256(body ?? new Uint8Array());
    const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const day = now.slice(0, 8);
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders = `host:${target.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${now}\n`;
    const canonicalRequest = `${method}\n${target.pathname}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const scope = `${day}/${this.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${now}\n${scope}\n${sha256(canonicalRequest)}`;
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.secretKey}`, day), this.region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    let response: Response;
    try {
      response = await fetch(target, {
        method,
        headers: {
          'x-amz-content-sha256': payloadHash,
          'x-amz-date': now,
          ...(body ? { 'content-type': contentType } : {}),
          authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        ...(body ? { body: new Uint8Array(body) } : {}),
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
    } catch (error) {
      const errorName = error instanceof Error && /^[A-Za-z]+Error$/.test(error.name) ? error.name : 'NetworkError';
      this.logger.error(`MinIO ${method} request failed: network error (${errorName}).`);
      throw new ServiceUnavailableException('Media object storage is unavailable');
    }
    if (response.ok || (missingOk && response.status === 404)) return response;
    const errorCode = safeS3ErrorCode(await response.text().catch(() => ''));
    this.logger.error(`MinIO ${method} request rejected: ${errorCode} (HTTP ${response.status}).`);
    if (response.status === 404) throw new NotFoundException('Fichier téléversé introuvable.');
    throw new ServiceUnavailableException('Media object storage is unavailable');
  }

  private objectUrl(
    endpoint: URL,
    bucket: string,
    key: string,
    namespace: 'upload' | 'quarantine' | 'ready' = 'quarantine',
  ) {
    const valid =
      namespace === 'upload'
        ? /^incoming\/[0-9a-f-]{36}$/i.test(key)
        : namespace === 'quarantine'
          ? /^sealed\/[0-9a-f-]{36}$/i.test(key)
          : /^assets\/[0-9a-f-]{36}(?:\/(?:preview|thumbnail))?$/i.test(key);
    if (!valid || (namespace === 'ready' ? this.bucket : this.quarantineBucket) !== bucket)
      throw new ServiceUnavailableException('Media storage key is invalid');
    const target = new URL(endpoint.toString());
    target.pathname = `${target.pathname.replace(/\/$/, '')}/${awsEncode(bucket)}/${key.split('/').map(awsEncode).join('/')}`;
    return target;
  }
}

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalQuery(params: URLSearchParams) {
  const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return [...params.entries()].map(([key, value]) => [encode(key), encode(value)] as const).sort(([ak, av], [bk, bv]) => ak.localeCompare(bk) || av.localeCompare(bv)).map(([key, value]) => `${key}=${value}`).join('&');
}

export function parseListObjectsPage(xml: string) {
  if (!xml.includes('<ListBucketResult')) throw new ServiceUnavailableException('MinIO inventory XML is invalid');
  const decode = (value: string) => value.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Number(number))).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const objects: Array<{ key: string; sizeBytes: number }> = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = match[1]?.match(/<Key>([\s\S]*?)<\/Key>/)?.[1];
    const size = match[1]?.match(/<Size>(\d+)<\/Size>/)?.[1];
    const sizeBytes = Number(size);
    if (key === undefined || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new ServiceUnavailableException('MinIO object inventory entry is invalid');
    objects.push({ key: decode(key), sizeBytes });
  }
  return {
    objects,
    isTruncated: /<IsTruncated>true<\/IsTruncated>/.test(xml),
    nextContinuationToken: xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ? decode(xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)![1]!) : undefined,
  };
}
