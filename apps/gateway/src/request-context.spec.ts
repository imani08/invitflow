import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequestContext, withRequestContextHeaders } from './request-context.js';

test('preserves valid request and correlation IDs', () => {
  assert.deepEqual(createRequestContext('request-123', 'flow-456'), {
    requestId: 'request-123',
    correlationId: 'flow-456',
  });
});

test('generates a request ID and uses it when incoming IDs are invalid', () => {
  let generated = 0;
  const context = createRequestContext('bad id', ['not-a-header'], () => {
    generated += 1;
    return 'generated-request';
  });

  assert.deepEqual(context, {
    requestId: 'generated-request',
    correlationId: 'generated-request',
  });
  assert.equal(generated, 1);
});

test('replaces spoofed propagation headers while preserving ordinary headers', () => {
  const headers = withRequestContextHeaders(
    { authorization: 'Bearer token', 'x-request-id': 'spoofed' },
    { requestId: 'gateway-request', correlationId: 'flow-456' },
  );

  assert.equal(headers.get('authorization'), 'Bearer token');
  assert.equal(headers.get('x-request-id'), 'gateway-request');
  assert.equal(headers.get('x-correlation-id'), 'flow-456');
});
