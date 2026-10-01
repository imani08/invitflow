import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpMetrics } from './http-metrics.js';

test('exports request counters and cumulative duration histogram buckets', () => {
  const metrics = new HttpMetrics();
  metrics.record('GET', 200, 0.02);
  metrics.record('GET', 200, 0.2);
  metrics.record('POST', 503, 8);

  const output = metrics.renderPrometheus();
  assert.match(output, /invitaflow_http_requests_total\{method="GET",status_code="200"\} 2/);
  assert.match(output, /invitaflow_http_request_duration_seconds_bucket\{method="GET",le="0\.025"\} 1/);
  assert.match(output, /invitaflow_http_request_duration_seconds_bucket\{method="GET",le="0\.25"\} 2/);
  assert.match(output, /invitaflow_http_request_duration_seconds_bucket\{method="GET",le="\+Inf"\} 2/);
  assert.match(output, /invitaflow_http_request_duration_seconds_sum\{method="GET"\} 0\.22/);
});

test('normalizes arbitrary methods and invalid status or duration values', () => {
  const metrics = new HttpMetrics();
  metrics.record('GET /user/secret?token=value', 700, Number.NaN);

  const output = metrics.renderPrometheus();
  assert.match(output, /invitaflow_http_requests_total\{method="OTHER",status_code="500"\} 1/);
  assert.match(output, /invitaflow_http_request_duration_seconds_sum\{method="OTHER"\} 0/);
  assert.doesNotMatch(output, /secret|token|value/);
});
