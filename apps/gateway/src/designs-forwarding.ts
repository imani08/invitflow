import type { FastifyRequest } from 'fastify';
import { withRequestContextHeaders, type RequestContext } from './request-context.js';

export const MEDIA_PROXY_DEFAULT_TIMEOUT_MS = 8_000;
export const MEDIA_COMPLETE_TIMEOUT_MS = 45_000;
export const DESIGNS_COMPOSER_ROUTES = {
  proposals: '/composer/proposals',
  select: '/composer/select',
} as const;

export function mediaProxyTimeoutMs(requestUrl: string) {
  const pathname = requestUrl.split(/[?#]/, 1)[0] ?? requestUrl;
  return /\/v1\/assets\/[^/]+\/complete$/.test(pathname)
    ? MEDIA_COMPLETE_TIMEOUT_MS
    : MEDIA_PROXY_DEFAULT_TIMEOUT_MS;
}

export function buildDesignsForwardRequest(
  request: Pick<FastifyRequest, 'url' | 'method' | 'headers' | 'body'>,
  serviceUrl: string,
  context: RequestContext,
): { url: string; init: RequestInit } {
  const authorization = request.headers['authorization'];
  if (typeof authorization !== 'string') throw new Error('Missing authorization header');
  const hasBody = request.body !== undefined;
  return {
    url: `${serviceUrl.replace(/\/$/, '')}${request.url}`,
    init: {
      method: request.method,
      headers: withRequestContextHeaders({
        authorization,
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
      }, context),
      ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    },
  };
}

export function forwardDesignsRequest(
  request: Pick<FastifyRequest, 'url' | 'method' | 'headers' | 'body'>,
  serviceUrl: string,
  context: RequestContext,
) {
  const forward = buildDesignsForwardRequest(request, serviceUrl, context);
  return globalThis.fetch(forward.url, forward.init);
}
