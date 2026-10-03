import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import { requiredEnv } from './env.js';
const sha = (v: Uint8Array | string) => createHash('sha256').update(v).digest('hex');
const hmac = (k: Uint8Array | string, v: string) => createHmac('sha256', k).update(v).digest();
@Injectable() export class InvitationStorage {
  private readonly endpoint = new URL(requiredEnv('MINIO_ENDPOINT', 'http://minio:9000')); private readonly bucket = requiredEnv('MINIO_INVITATION_BUCKET', 'invitations'); private readonly region = requiredEnv('MINIO_REGION', 'us-east-1'); private readonly access = requiredEnv('MINIO_INVITATION_ACCESS_KEY'); private readonly secret = requiredEnv('MINIO_INVITATION_SECRET_KEY');
  async put(key: string, body: Buffer, type: string) { await this.request('PUT', key, body, type); }
  async get(key: string) { return Buffer.from(await (await this.request('GET', key)).arrayBuffer()); }
  async stream(key: string) { return this.request('GET', key); }
  async delete(key: string) { const r = await this.request('DELETE', key); if (!r.ok && r.status !== 404) throw new ServiceUnavailableException('Object storage unavailable'); }
  private async request(method: string, key: string, body?: Buffer, type?: string) {
    if (!/^(?:pdf\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf|batches\/[0-9a-f-]{36}\.zip|batches\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:webp|png))$/i.test(key)) throw new ServiceUnavailableException('Storage object key is invalid');
    const target = new URL(`/${this.bucket}/${key}`, this.endpoint); const hash = sha(body ?? new Uint8Array()); const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); const day = now.slice(0, 8);
    const headers = { host: target.host, 'x-amz-content-sha256': hash, 'x-amz-date': now, ...(type ? { 'content-type': type } : {}) }; const signed = 'host;x-amz-content-sha256;x-amz-date';
    const canonical = `${method}\n${target.pathname}\n\nhost:${target.host}\nx-amz-content-sha256:${hash}\nx-amz-date:${now}\n${signed}\n${hash}`; const scope = `${day}/${this.region}/s3/aws4_request`;
    const keyDate = hmac(`AWS4${this.secret}`, day); const signKey = hmac(hmac(hmac(keyDate, this.region), 's3'), 'aws4_request'); const sig = createHmac('sha256', signKey).update(`AWS4-HMAC-SHA256\n${now}\n${scope}\n${sha(canonical)}`).digest('hex');
    try { const response = await fetch(target, { method, headers: { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${this.access}/${scope}, SignedHeaders=${signed}, Signature=${sig}` }, ...(body ? { body: new Uint8Array(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(15000) }); if (response.ok || method === 'DELETE' && response.status === 404) return response; throw new Error(); } catch { throw new ServiceUnavailableException('Invitation object storage is unavailable'); }
  }
}
