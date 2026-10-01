import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpMetrics } from './http-metrics.js';

test('exports request counters and cumulative duration histogram buckets', () => {
  const metrics = new HttpMetrics();
  metrics.record('GET', 200, 0.02, '/v1/events/:eventId');
  metrics.record('GET', 200, 0.2, '/v1/events/:eventId');
  metrics.record('POST', 503, 8, '/v1/payments');

  const output = metrics.renderPrometheus();
  assert.match(output, /invitaflow_http_requests_total\{method="GET",route="\/v1\/events\/:eventId",status_code="200"\} 2/);
  assert.match(output, /invitaflow_http_request_duration_seconds_bucket\{method="GET",route="\/v1\/events\/:eventId",le="0\.025"\} 1/);
  assert.match(output, /invitaflow_http_request_duration_seconds_bucket\{method="GET",route="\/v1\/events\/:eventId",le="0\.25"\} 2/);
  assert.match(output, /invitaflow_http_request_duration_seconds_bucket\{method="GET",route="\/v1\/events\/:eventId",le="\+Inf"\} 2/);
  assert.match(output, /invitaflow_http_request_duration_seconds_sum\{method="GET",route="\/v1\/events\/:eventId"\} 0\.22/);
});

test('normalizes arbitrary methods and invalid status or duration values', () => {
  const metrics = new HttpMetrics();
  metrics.record('GET /user/secret?token=value', 700, Number.NaN, '/users/private-user?token=secret');

  const output = metrics.renderPrometheus();
  assert.match(output, /invitaflow_http_requests_total\{method="OTHER",route="unknown",status_code="500"\} 1/);
  assert.match(output, /invitaflow_http_request_duration_seconds_sum\{method="OTHER",route="unknown"\} 0/);
  assert.doesNotMatch(output, /secret|token|value/);
});

test('groups unregistered and overlong paths under one bounded route label', () => {
  const metrics = new HttpMetrics();
  metrics.record('GET', 404, 0.01, `/unregistered/${'x'.repeat(300)}`);

  const output = metrics.renderPrometheus();
  assert.match(output, /route="unknown"/);
  assert.doesNotMatch(output, /x{20}/);
});
