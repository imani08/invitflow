import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { createBoundedPostUpload, createSignedGetDownload } from '../s3-presign.mjs';
import { requiredEnv } from './env.js';

const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Uint8Array | string, value: string) =>
  createHmac('sha256', key).update(value).digest();

@Injectable()
export class MediaStorage {
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
    const canonicalRequest = `${method}\n${target.pathname}\n\n${canonicalHeaders}${signedHeaders}\n${payloadHash}`;
    const scope = `${day}/${this.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${now}\n${scope}\n${sha256(canonicalRequest)}`;
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.secretKey}`, day), this.region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    try {
      const response = await fetch(target, {
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
      if (response.ok || (missingOk && response.status === 404)) return response;
      if (response.status === 404) throw new NotFoundException('Fichier téléversé introuvable.');
      throw new Error('Object storage rejected the request');
    } catch (error) {
      if (error instanceof ServiceUnavailableException || error instanceof NotFoundException)
        throw error;
      throw new ServiceUnavailableException('Media object storage is unavailable');
    }
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
