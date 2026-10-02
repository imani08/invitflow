import 'reflect-metadata';
import {
  All,
  Controller,
  Delete,
  Get,
  Header,
  Module,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { Readable } from 'node:stream';
import { performance } from 'node:perf_hooks';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { HttpMetrics } from './http-metrics.js';
import {
  createRequestContext,
  withRequestContextHeaders,
  type RequestContext,
} from './request-context.js';

function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

@Controller()
class HealthController {
  @Get('/health')
  health() {
    return this.live();
  }

  @Get('/health/live')
  live() {
    return { status: 'ok', service: 'gateway', timestamp: new Date().toISOString() };
  }

  @Get('/health/ready')
  ready() {
    return { status: 'ok', service: 'gateway', timestamp: new Date().toISOString() };
  }
}

const httpMetrics = new HttpMetrics();
const requestStartedAt = new WeakMap<FastifyRequest, number>();
const requestContexts = new WeakMap<FastifyRequest, RequestContext>();

function fetchWithRequestContext(
  request: FastifyRequest,
  input: string | URL | Request,
  init: RequestInit = {},
): Promise<Response> {
  const context = requestContexts.get(request);
  if (!context) throw new Error('Request context was not initialized');
  return globalThis.fetch(input, {
    ...init,
    headers: withRequestContextHeaders(init.headers, context),
  });
}

@Controller()
class MetricsController {
  @Get('/metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics() {
    return httpMetrics.renderPrometheus();
  }
}

@Controller('/v1/profile')
class ProfileProxyController {
  @Get('/me')
  getMe(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.forward(request, reply, 'GET');
  }

  @Put('/me')
  putMe(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.forward(request, reply, 'PUT');
  }

  @Get('/me/deletion-request')
  getDeletionRequest(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.forward(request, reply, 'GET', 'deletion-request');
  }

  @Post('/me/deletion-request')
  postDeletionRequest(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.forward(request, reply, 'POST', 'deletion-request');
  }

  @Delete('/me/deletion-request')
  deleteDeletionRequest(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.forward(request, reply, 'DELETE', 'deletion-request');
  }

  private async forward(
    request: FastifyRequest,
    reply: FastifyReply,
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    suffix = '',
  ) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)) {
      throw new UnauthorizedException();
    }
    reply.header('Cache-Control', 'private, no-store');
    const baseUrl = requiredEnv('PROFILE_SERVICE_URL');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${baseUrl.replace(/\/$/, '')}/v1/me${suffix ? `/${suffix}` : ''}`,
        {
          method,
          headers: {
            authorization,
            ...(['PUT', 'POST'].includes(method) ? { 'content-type': 'application/json' } : {}),
          },
          ...(['PUT', 'POST'].includes(method) ? { body: JSON.stringify(request.body ?? {}) } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(4_000),
        },
      );
      const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'profile_service_unavailable' });
    }
  }
}

@Controller('/v1/events')
class EventsProxyController {
  @All()
  root(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:eventId') event(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:eventId/publish') publish(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:eventId/cancel') cancel(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:eventId/ceremonies') ceremonies(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/:eventId/ceremonies/:ceremonyId') ceremony(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }

  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    const baseUrl = requiredEnv('EVENTS_SERVICE_URL');
    const targetPath = request.url.replace(/^\/v1\/events/, '/v1/events');
    try {
      const upstream = await fetchWithRequestContext(request, `${baseUrl.replace(/\/$/, '')}${targetPath}`, {
        method: request.method,
        headers: {
          authorization,
          ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
      const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'events_service_unavailable' });
    }
  }
}

@Controller('/v1/agencies')
class AgenciesProxyController {
  @All()
  root(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }
  @All('/:workspaceId/:resource')
  resource(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }
  @All('/:workspaceId/:resource/:resourceId')
  resourceItem(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }
  @All('/:workspaceId/:resource/:resourceId/:action')
  resourceAction(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }

  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)) throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    try {
      const upstream = await fetchWithRequestContext(request, `${requiredEnv('EVENTS_SERVICE_URL').replace(/\/$/, '')}${request.url}`, {
        method: request.method,
        headers: { authorization, ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}) },
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        cache: 'no-store', signal: AbortSignal.timeout(5_000),
      });
      return reply.code(upstream.status).send(await upstream.json().catch(() => ({ error: 'invalid_upstream_response' })));
    } catch { return reply.code(503).send({ error: 'events_service_unavailable' }); }
  }
}

@Controller('/v1/assets')
class MediaProxyController {
  @All()
  assets(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:assetId')
  asset(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:assetId/:action')
  assetAction(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }

  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    if (request.method !== 'GET' && request.method !== 'POST' && request.method !== 'DELETE')
      return reply.code(405).send({ error: 'method_not_allowed' });
    if (request.method !== 'GET' && Buffer.byteLength(JSON.stringify(request.body ?? {})) > 16_384)
      return reply.code(413).send({ error: 'payload_too_large' });
    reply.header('Cache-Control', 'private, no-store');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('MEDIA_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          headers: {
            authorization,
            ...(request.method !== 'GET' ? { 'content-type': 'application/json' } : {}),
          },
          ...(request.method !== 'GET' ? { body: JSON.stringify(request.body ?? {}) } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(8_000),
        },
      );
      return reply
        .code(upstream.status)
        .send(await upstream.json().catch(() => ({ error: 'invalid_media_response' })));
    } catch {
      return reply.code(503).send({ error: 'media_service_unavailable' });
    }
  }
}

@Controller('/v1/events/:eventId')
class GuestsProxyController {
  @All('/guests') guests(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/guests/groups') groups(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/guests/groups/:groupId') group(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/guests/:guestId/ceremonies/:ceremonyId') ceremonyAccess(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/guests/:guestId') guest(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/guests/:guestId/ceremonies') access(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @Post('/guest-imports') upload(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxyUpload(request, reply);
  }
  @All('/guest-imports/:jobId') importJob(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/guest-imports/:jobId/:action') importAction(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }

  private assertBearer(request: FastifyRequest) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    return authorization;
  }

  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    const authorization = this.assertBearer(request);
    reply.header('Cache-Control', 'private, no-store');
    const baseUrl = requiredEnv('GUESTS_SERVICE_URL');
    try {
      const upstream = await fetchWithRequestContext(request, `${baseUrl.replace(/\/$/, '')}${request.url}`, {
        method: request.method,
        headers: {
          authorization,
          ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        cache: 'no-store',
        signal: AbortSignal.timeout(18_000),
      });
      const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'guests_service_unavailable' });
    }
  }

  private async proxyUpload(request: FastifyRequest, reply: FastifyReply) {
    const authorization = this.assertBearer(request);
    reply.header('Cache-Control', 'private, no-store');
    let form: FormData;
    try {
      const upload = await request.file({
        limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 0, parts: 1 },
      });
      if (!upload) return reply.code(400).send({ error: 'file_required' });
      const bytes = await upload.toBuffer();
      if (upload.file.truncated || bytes.byteLength > 5 * 1024 * 1024)
        return reply.code(413).send({ error: 'file_too_large' });
      form = new FormData();
      form.append(
        'file',
        new Blob([Uint8Array.from(bytes)], { type: upload.mimetype }),
        upload.filename.replace(/[\\/\x00-\x1f]/g, '_').slice(-255),
      );
    } catch (error) {
      const statusCode =
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
          ? error.statusCode
          : 400;
      return reply
        .code(statusCode === 413 ? 413 : 400)
        .send({ error: statusCode === 413 ? 'file_too_large' : 'invalid_upload' });
    }
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('GUESTS_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: 'POST',
          headers: { authorization },
          body: form,
          cache: 'no-store',
          signal: AbortSignal.timeout(20_000),
        },
      );
      const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'guests_service_unavailable' });
    }
  }
}

@Controller('/v1/events/:eventId/ceremonies/:ceremonyId/seating')
class SeatingProxyController {
  @All() plan(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/tables') tables(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/tables/:tableId') table(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/zones') zones(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/zones/:zoneId') zone(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/assignments') assignments(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/assignments/:guestId') assignment(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @Post('/imports') upload(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxyUpload(request, reply);
  }
  @All('/imports/:jobId') importJob(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/imports/:jobId/:action') importAction(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }

  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('SEATING_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          headers: {
            authorization,
            ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(18_000),
        },
      );
      const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'seating_service_unavailable' });
    }
  }

  private async proxyUpload(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    let form: FormData;
    try {
      const upload = await request.file({
        limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 0, parts: 1 },
      });
      if (!upload) return reply.code(400).send({ error: 'file_required' });
      const bytes = await upload.toBuffer();
      if (upload.file.truncated || bytes.byteLength > 5 * 1024 * 1024)
        return reply.code(413).send({ error: 'file_too_large' });
      form = new FormData();
      form.append(
        'file',
        new Blob([Uint8Array.from(bytes)], { type: upload.mimetype }),
        upload.filename.replace(/[\\/\x00-\x1f]/g, '_').slice(-255),
      );
    } catch (error) {
      const statusCode =
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        typeof error.statusCode === 'number'
          ? error.statusCode
          : 400;
      return reply
        .code(statusCode === 413 ? 413 : 400)
        .send({ error: statusCode === 413 ? 'file_too_large' : 'invalid_upload' });
    }
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('SEATING_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: 'POST',
          headers: { authorization },
          body: form,
          cache: 'no-store',
          signal: AbortSignal.timeout(20_000),
        },
      );
      const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'seating_service_unavailable' });
    }
  }
}

@Controller('/v1/events/:eventId/designs')
class DesignsProxyController {
  @All() collection(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:designId') design(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:designId/validate') validate(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:designId/versions') versions(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:designId/restore') restore(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:designId/ai-jobs') aiJobs(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxyAi(request, reply);
  }
  @All('/:designId/ai-jobs/:jobId/preview') aiJobPreview(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxyAi(request, reply);
  }
  @All('/:designId/ai-jobs/:jobId') aiJob(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxyAi(request, reply);
  }
  @All('/:designId/ai-jobs/:jobId/retry') retryAiJob(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxyAi(request, reply);
  }
  @All('/templates') templates(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/templates/:templateId') template(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }

  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('DESIGNS_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          headers: {
            authorization,
            ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(8_000),
        },
      );
      const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'designs_service_unavailable' });
    }
  }

  private async proxyAi(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('AI_DESIGN_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          headers: {
            authorization,
            ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(8_000),
        },
      );
      if (
        request.url.endsWith('/preview') &&
        upstream.ok &&
        upstream.headers.get('content-type')?.startsWith('image/png')
      ) {
        reply.header('Content-Type', 'image/png').header('X-Content-Type-Options', 'nosniff');
        return reply.code(upstream.status).send(new Uint8Array(await upstream.arrayBuffer()));
      }
      const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'ai_design_service_unavailable' });
    }
  }
}

@Controller('/v1/wallet')
class WalletProxyController {
  @All('/me') me(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/me/transactions') transactions(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('WALLET_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          headers: { authorization },
          cache: 'no-store',
          signal: AbortSignal.timeout(5_000),
        },
      );
      const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'wallet_service_unavailable' });
    }
  }
}

@Controller()
class BillingProxyController {
  @All('/v1/pricing') pricing(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/v1/quotes') quote(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/v1/admin/price-schedules') schedules(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('BILLING_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          headers: {
            authorization,
            ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(typeof request.headers['idempotency-key'] === 'string'
              ? { 'idempotency-key': request.headers['idempotency-key'] }
              : {}),
          },
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(8_000),
        },
      );
      const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'billing_service_unavailable' });
    }
  }
}

@Controller('/v1/payments')
class PaymentsProxyController {
  @All() create(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/me') list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/webhooks/:provider') webhook(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply, true);
  }
  @All('/:paymentId/mock-confirm') mockConfirm(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/:paymentId') detail(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }

  private async proxy(request: FastifyRequest, reply: FastifyReply, webhook = false) {
    const authorization = request.headers['authorization'];
    if (!webhook && (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    const headers: Record<string, string> = {};
    if (typeof authorization === 'string') headers['authorization'] = authorization;
    if (typeof request.headers['idempotency-key'] === 'string')
      headers['idempotency-key'] = request.headers['idempotency-key'];
    if (webhook) {
      const contentType = request.headers['content-type'];
      const token = request.headers['x-token'];
      if (typeof contentType === 'string') headers['content-type'] = contentType;
      if (typeof token === 'string') headers['x-token'] = token;
    } else if (request.body !== undefined) headers['content-type'] = 'application/json';
    const rawBody =
      webhook && typeof request.body === 'string'
        ? request.body
        : request.body === undefined
          ? undefined
          : JSON.stringify(request.body);
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('PAYMENTS_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          headers,
          ...(rawBody !== undefined ? { body: rawBody } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(12_000),
        },
      );
      const payload = await upstream.json().catch(() => ({ error: 'invalid_payments_response' }));
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'payments_service_unavailable' });
    }
  }
}

@Controller('/v1/notifications')
class NotificationsProxyController {
  @All() list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/read-all') readAll(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/preferences') preferences(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:notificationId/read') readOne(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }

  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    if (!['GET', 'POST', 'PATCH'].includes(request.method))
      return reply.code(405).send({ error: 'method_not_allowed' });
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('NOTIFICATIONS_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          headers: {
            authorization,
            ...(request.body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(6_000),
        },
      );
      return reply
        .code(upstream.status)
        .send(await upstream.json().catch(() => ({ error: 'invalid_notifications_response' })));
    } catch {
      return reply.code(503).send({ error: 'notifications_service_unavailable' });
    }
  }
}

@Controller('/v1/admin/reconciliation')
class PaymentReconciliationProxyController {
  @All('/issues') issues(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    return fetchWithRequestContext(request,
      `${requiredEnv('PAYMENTS_SERVICE_URL').replace(/\/$/, '')}/v1/admin/reconciliation/issues`,
      {
        method: request.method,
        headers: { authorization },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      },
    )
      .then(async (upstream) =>
        reply
          .code(upstream.status)
          .send(await upstream.json().catch(() => ({ error: 'invalid_payments_response' }))),
      )
      .catch(() => reply.code(503).send({ error: 'payments_service_unavailable' }));
  }
}

@Controller('/v1/admin/payments')
class PaymentFinanceProxyController {
  @All() list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    if (request.method !== 'GET') return reply.code(405).send({ error: 'method_not_allowed' });
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    return fetchWithRequestContext(request, `${requiredEnv('PAYMENTS_SERVICE_URL').replace(/\/$/, '')}${request.url}`, {
      method: 'GET',
      headers: { authorization },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
      .then(async (upstream) =>
        reply
          .code(upstream.status)
          .send(await upstream.json().catch(() => ({ error: 'invalid_payments_response' }))),
      )
      .catch(() => reply.code(503).send({ error: 'payments_service_unavailable' }));
  }

  @Post('/:paymentId/refund') refund(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    return fetchWithRequestContext(request, `${requiredEnv('PAYMENTS_SERVICE_URL').replace(/\/$/, '')}${request.url}`, {
      method: 'POST',
      headers: { authorization },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    })
      .then(async (upstream) =>
        reply
          .code(upstream.status)
          .send(await upstream.json().catch(() => ({ error: 'invalid_payments_response' }))),
      )
      .catch(() => reply.code(503).send({ error: 'payments_service_unavailable' }));
  }
}

@Controller('/v1')
class InvitationsProxyController {
  @All('/events/:eventId/invitations/batches') createOrList(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/events/:eventId/invitations/batches/:batchId') eventBatch(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/events/:eventId/invitations/batches/:batchId/cancel') eventCancel(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/events/:eventId/invitations/batches/:batchId/download') eventDownload(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/events/:eventId/invitations/batches/:batchId/items/:itemId/download') eventItem(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/invitations/batches') list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/invitations/batches/:batchId') batch(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/invitations/batches/:batchId/cancel') cancel(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/invitations/batches/:batchId/download') download(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  @All('/invitations/batches/:batchId/items/:itemId/download') item(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.proxy(request, reply);
  }
  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    if (!['GET', 'POST'].includes(request.method))
      return reply.code(405).send({ error: 'method_not_allowed' });
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    try {
      const headers: Record<string, string> = { authorization };
      if (request.body !== undefined) headers['content-type'] = 'application/json';
      const deviceId = request.headers['x-checkin-device-id'];
      if (typeof deviceId === 'string' && deviceId.length <= 200) headers['x-checkin-device-id'] = deviceId;
      if (typeof request.headers['idempotency-key'] === 'string')
        headers['idempotency-key'] = request.headers['idempotency-key'];
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('INVITATIONS_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          headers,
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(12000),
        },
      );
      const type = upstream.headers.get('content-type') ?? '';
      if (type.startsWith('application/pdf') || type.startsWith('application/zip')) {
        reply.header('Content-Type', type).header('X-Content-Type-Options', 'nosniff');
        const disposition = upstream.headers.get('content-disposition');
        if (disposition) reply.header('Content-Disposition', disposition);
        if (!upstream.body) return reply.code(502).send({ error: 'empty_invitations_download' });
        return reply
          .code(upstream.status)
          .send(
            Readable.fromWeb(upstream.body as unknown as import('node:stream/web').ReadableStream),
          );
      }
      return reply
        .code(upstream.status)
        .send(await upstream.json().catch(() => ({ error: 'invalid_invitations_response' })));
    } catch {
      return reply.code(503).send({ error: 'invitations_service_unavailable' });
    }
  }
}

@Controller('/v1')
class AccessProxyController {
  @All('/events/:eventId/access-agents')
  agents(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }
  @All('/events/:eventId/ceremonies/:ceremonyId/access-agents')
  ceremonyAgents(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }
  @All('/events/:eventId/ceremonies/:ceremonyId/access-agents/:agentSubject')
  ceremonyAgent(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }
  @All('/events/:eventId/access-agents/:agentSubject')
  agent(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }
  @All('/check-in/events/:eventId')
  context(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }
  @All('/events/:eventId/check-in')
  summary(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }
  @All('/events/:eventId/check-in/scan')
  scan(@Req() request: FastifyRequest, @Res() reply: FastifyReply) { return this.proxy(request, reply); }

  async proxy(request: FastifyRequest, reply: FastifyReply) {
    if (!['GET', 'PUT', 'DELETE', 'POST'].includes(request.method)) return reply.code(405).send({ error: 'method_not_allowed' });
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization)) throw new UnauthorizedException();
    const headers: Record<string, string> = { authorization };
    if (request.body !== undefined) headers['content-type'] = 'application/json';
    const device = request.headers['x-checkin-device-id'];
    if (typeof device === 'string' && device.length <= 200) headers['x-checkin-device-id'] = device;
    if (request.body !== undefined && Buffer.byteLength(JSON.stringify(request.body)) > 8192) return reply.code(413).send({ error: 'payload_too_large' });
    try {
      const upstream = await fetchWithRequestContext(request, `${requiredEnv('ACCESS_SERVICE_URL').replace(/\/$/, '')}${request.url}`, {
        method: request.method, headers,
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        cache: 'no-store', signal: AbortSignal.timeout(10_000),
      });
      const payload = await upstream.json().catch(() => ({ error: 'invalid_access_response' }));
      reply.header('Cache-Control', 'private, no-store');
      return reply.code(upstream.status).send(payload);
    } catch {
      return reply.code(503).send({ error: 'access_service_unavailable' });
    }
  }
}

@Controller('/v1/public/invitations')
class PublicInvitationsProxyController {
  @All('/:token') get(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  @All('/:token/rsvp') rsvp(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.proxy(request, reply);
  }
  private async proxy(request: FastifyRequest, reply: FastifyReply) {
    if (request.method !== 'GET' && request.method !== 'POST')
      return reply.code(405).send({ error: 'method_not_allowed' });
    const pathToken = request.url.split('/')[4]?.split('?')[0] ?? '';
    if (!/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/i.test(pathToken))
      return reply.code(404).send({ error: 'invitation_not_found' });
    if (
      request.method === 'POST' &&
      (!request.url.endsWith('/rsvp') ||
        !request.headers['content-type']?.toLowerCase().startsWith('application/json'))
    )
      return reply.code(415).send({ error: 'unsupported_media_type' });
    if (request.method === 'POST' && Buffer.byteLength(JSON.stringify(request.body ?? {})) > 16_384)
      return reply.code(413).send({ error: 'payload_too_large' });
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('INVITATIONS_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          ...(request.method === 'POST'
            ? {
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(request.body ?? {}),
              }
            : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        },
      );
      return reply
        .code(upstream.status)
        .send(await upstream.json().catch(() => ({ error: 'invalid_invitations_response' })));
    } catch {
      return reply.code(503).send({ error: 'invitations_service_unavailable' });
    }
  }
}

@Controller('/v1/admin/audit-events')
class AuditProxyController {
  @Get()
  async list(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('AUDIT_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        { headers: { authorization }, cache: 'no-store', signal: AbortSignal.timeout(10_000) },
      );
      return reply
        .code(upstream.status)
        .send(await upstream.json().catch(() => ({ error: 'invalid_audit_response' })));
    } catch {
      return reply.code(503).send({ error: 'audit_service_unavailable' });
    }
  }
}

@Controller('/v1/admin/analytics')
class AnalyticsProxyController {
  @Get('/daily')
  async daily(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    reply.header('Cache-Control', 'private, no-store');
    const incoming = new URL(request.url, 'http://gateway');
    const query = new URLSearchParams();
    for (const name of ['from', 'to']) {
      const values = incoming.searchParams.getAll(name);
      if (values.length === 1) query.set(name, values[0]!);
    }
    const baseUrl = requiredEnv('ANALYTICS_SERVICE_URL');
    try {
      const upstream = await fetchWithRequestContext(request,
        `${baseUrl.replace(/\/$/, '')}/v1/admin/analytics/daily${query.size ? `?${query}` : ''}`,
        {
          headers: { authorization },
          cache: 'no-store',
          signal: AbortSignal.timeout(5_000),
        },
      );
      return reply
        .code(upstream.status)
        .send(await upstream.json().catch(() => ({ error: 'invalid_analytics_response' })));
    } catch {
      return reply.code(503).send({ error: 'analytics_service_unavailable' });
    }
  }
}

@Controller('/v1')
class ModerationProxyController {
  @Post('/moderation/reports') create(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    return this.forward(request, reply);
  }
  @Get('/admin/moderation-reports') list(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.forward(request, reply);
  }
  @Patch('/admin/moderation-reports/:reportId') review(
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    return this.forward(request, reply);
  }
  private async forward(request: FastifyRequest, reply: FastifyReply) {
    const authorization = request.headers['authorization'];
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/.test(authorization))
      throw new UnauthorizedException();
    if (
      request.method !== 'GET' &&
      !request.headers['content-type']?.toLowerCase().startsWith('application/json')
    )
      return reply.code(415).send({ error: 'unsupported_media_type' });
    if (request.method !== 'GET' && Buffer.byteLength(JSON.stringify(request.body ?? {})) > 16_384)
      return reply.code(413).send({ error: 'payload_too_large' });
    reply.header('Cache-Control', 'private, no-store');
    try {
      const headers: Record<string, string> = { authorization };
      if (request.method !== 'GET') headers['content-type'] = 'application/json';
      const idempotencyKey = request.headers['idempotency-key'];
      if (typeof idempotencyKey === 'string' && /^[A-Za-z0-9._:@/-]{1,200}$/.test(idempotencyKey))
        headers['idempotency-key'] = idempotencyKey;
      const upstream = await fetchWithRequestContext(request,
        `${requiredEnv('AUDIT_SERVICE_URL').replace(/\/$/, '')}${request.url}`,
        {
          method: request.method,
          headers,
          ...(request.method !== 'GET' ? { body: JSON.stringify(request.body ?? {}) } : {}),
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        },
      );
      return reply
        .code(upstream.status)
        .send(await upstream.json().catch(() => ({ error: 'invalid_moderation_response' })));
    } catch {
      return reply.code(503).send({ error: 'audit_service_unavailable' });
    }
  }
}

@Module({
  controllers: [
    HealthController,
    MetricsController,
    AccessProxyController,
    ProfileProxyController,
    EventsProxyController,
    AgenciesProxyController,
    MediaProxyController,
    GuestsProxyController,
    SeatingProxyController,
    DesignsProxyController,
    WalletProxyController,
    BillingProxyController,
    PaymentsProxyController,
    NotificationsProxyController,
    InvitationsProxyController,
    PublicInvitationsProxyController,
    AuditProxyController,
    AnalyticsProxyController,
    ModerationProxyController,
    PaymentReconciliationProxyController,
    PaymentFinanceProxyController,
  ],
})
class GatewayModule {}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    GatewayModule,
    new FastifyAdapter({
      logger: { redact: { paths: ['req.url'], censor: '[redacted]' } },
      bodyLimit: 6 * 1024 * 1024,
    }),
  );
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => done(null, body),
    );
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
  });
  app.enableCors({
    origin: [
      requiredEnv('WEB_ORIGIN', 'http://localhost:3000'),
      requiredEnv('ADMIN_ORIGIN', 'http://localhost:3001'),
    ],
    credentials: true,
  });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', async (request, reply) => {
      if (request.url.split('?')[0] !== '/metrics')
        requestStartedAt.set(request, performance.now());
      const incoming = request.headers['x-request-id'];
      const correlation = request.headers['x-correlation-id'];
      const { requestId, correlationId } = createRequestContext(incoming, correlation);
      requestContexts.set(request, { requestId, correlationId });
      reply.header('x-request-id', requestId);
      reply.header('x-correlation-id', correlationId);
      reply.header('x-content-type-options', 'nosniff');
      reply.header('x-frame-options', 'DENY');
      reply.header('referrer-policy', 'no-referrer');
      reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
      reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onResponse', async (request, reply) => {
      const startedAt = requestStartedAt.get(request);
      if (startedAt !== undefined)
        httpMetrics.record(
          request.method,
          reply.statusCode,
          (performance.now() - startedAt) / 1000,
          request.routeOptions.url,
        );
    });
  const port = Number(requiredEnv('PORT', '3002'));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a valid TCP port');
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
