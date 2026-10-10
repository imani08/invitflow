import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESIGNS_COMPOSER_ROUTES,
  forwardDesignsRequest,
  MEDIA_COMPLETE_TIMEOUT_MS,
  MEDIA_PROXY_DEFAULT_TIMEOUT_MS,
  mediaProxyTimeoutMs,
} from './designs-forwarding.js';
import type { RequestContext } from './request-context.js';

const context: RequestContext = { requestId: 'request-123', correlationId: 'flow-456' };

for (const [route, method] of [
  [DESIGNS_COMPOSER_ROUTES.proposals, 'POST'],
  [DESIGNS_COMPOSER_ROUTES.select, 'POST'],
] as const) {
  test(`Designs composer ${route} forwards to Designs with auth, JSON and request context`, async (t) => {
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response('{"accepted":true}', { status: 202 });
    };

    const payload = { designId: 'design-1', choice: 'premium' };
    const response = await forwardDesignsRequest({
      url: `/v1/events/event-1/designs${route}`,
      method,
      headers: { authorization: 'Bearer user-token' },
      body: payload,
    }, 'http://designs:3000/', context);

    assert.equal(capturedUrl, `http://designs:3000/v1/events/event-1/designs${route}`);
    assert.equal(capturedInit?.method, 'POST');
    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get('authorization'), 'Bearer user-token');
    assert.equal(headers.get('content-type'), 'application/json');
    assert.equal(headers.get('x-request-id'), context.requestId);
    assert.equal(headers.get('x-correlation-id'), context.correlationId);
    assert.equal(capturedInit?.body, JSON.stringify(payload));
    assert.equal(response.status, 202);
  });
}

test('only the Media complete action gets the extended timeout', () => {
  assert.equal(mediaProxyTimeoutMs('/v1/assets/asset-1/complete'), MEDIA_COMPLETE_TIMEOUT_MS);
  assert.equal(mediaProxyTimeoutMs('/v1/assets/asset-1/complete?source=upload'), MEDIA_COMPLETE_TIMEOUT_MS);
  assert.equal(mediaProxyTimeoutMs('/v1/assets/asset-1'), MEDIA_PROXY_DEFAULT_TIMEOUT_MS);
  assert.equal(mediaProxyTimeoutMs('/v1/assets/asset-1/upload-url'), MEDIA_PROXY_DEFAULT_TIMEOUT_MS);
  assert.equal(MEDIA_COMPLETE_TIMEOUT_MS, 45_000);
  assert.ok(MEDIA_COMPLETE_TIMEOUT_MS > MEDIA_PROXY_DEFAULT_TIMEOUT_MS);
});
