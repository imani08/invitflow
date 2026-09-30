import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { requiredEnv } from './env.js';

const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const hmac = (key: Uint8Array | string, value: string) => createHmac('sha256', key).update(value).digest();

@Injectable()
export class PreviewStorage {
  private readonly endpoint = new URL(requiredEnv('MINIO_ENDPOINT', 'http://minio:9000'));
  private readonly bucket = requiredEnv('MINIO_PREVIEW_BUCKET', 'previews');
  private readonly region = requiredEnv('MINIO_REGION', 'us-east-1');
  private readonly accessKey = requiredEnv('MINIO_ACCESS_KEY');
  private readonly secretKey = requiredEnv('MINIO_SECRET_KEY');

  key(eventId: string, designId: string, jobId: string) { return `ai-design/${eventId}/${designId}/${jobId}.png`; }

  async put(eventId: string, designId: string, jobId: string, bytes: Buffer) {
    const key = this.key(eventId, designId, jobId);
    await this.request('PUT', key, bytes, 'image/png');
    return key;
  }

  async get(key: string) {
    if (!/^ai-design\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/i.test(key)) throw new ServiceUnavailableException('Preview storage key is invalid');
    const response = await this.request('GET', key);
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > 2 * 1024 * 1024) throw new ServiceUnavailableException('Preview image exceeds the configured size limit');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024 || !isPng(bytes)) throw new ServiceUnavailableException('Stored preview image is invalid');
    return bytes;
  }

  async delete(key: string) {
    if (!/^ai-design\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/i.test(key)) return;
    const response = await this.request('DELETE', key);
    if (!response.ok && response.status !== 404) throw new ServiceUnavailableException('Preview storage could not remove an expired image');
  }

  private async request(method: 'PUT' | 'GET' | 'DELETE', objectKey: string, body?: Buffer, contentType?: string) {
    const path = `/${this.bucket}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
    const target = new URL(path, this.endpoint);
    const payloadHash = sha256(body ?? new Uint8Array());
    const now = new Date();
    const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const shortDate = date.slice(0, 8);
    const headers = {
      host: target.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': date,
      ...(contentType ? { 'content-type': contentType } : {}),
    };
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders = `host:${headers.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${date}\n`;
    const canonicalRequest = `${method}\n${target.pathname}\n\n${canonicalHeaders}${signedHeaders}\n${payloadHash}`;
    const scope = `${shortDate}/${this.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha256(canonicalRequest)}`;
    const dateKey = hmac(`AWS4${this.secretKey}`, shortDate);
    const regionKey = hmac(dateKey, this.region);
    const serviceKey = hmac(regionKey, 's3');
    const signingKey = hmac(serviceKey, 'aws4_request');
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    try {
      const response = await fetch(target, {
        method,
        headers: {
          ...headers,
          authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        ...(body ? { body: new Uint8Array(body) } : {}),
        cache: 'no-store', signal: AbortSignal.timeout(8_000),
      });
      if (method === 'PUT' && response.ok || method === 'GET' && response.ok || method === 'DELETE' && (response.ok || response.status === 404)) return response;
      throw new Error(`S3 request rejected with status ${response.status}`);
    } catch {
      throw new ServiceUnavailableException('Preview storage is unavailable');
    }
  }
}

export function isPng(bytes: Buffer) {
  return bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
    && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(16) <= 1024 && bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(20) <= 1536;
}
