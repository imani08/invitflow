const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] as const;

type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'OTHER';
type Duration = { count: number; sum: number; buckets: number[] };

export class HttpMetrics {
  readonly #requests = new Map<string, number>();
  readonly #durations = new Map<Method, Duration>();

  record(method: string, statusCode: number, durationSeconds: number) {
    const normalizedMethod: Method = METHODS.has(method) ? method as Method : 'OTHER';
    const normalizedStatus = Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599 ? statusCode : 500;
    const key = `${normalizedMethod}\u0000${normalizedStatus}`;
    this.#requests.set(key, (this.#requests.get(key) ?? 0) + 1);

    let duration = this.#durations.get(normalizedMethod);
    if (!duration) {
      duration = { count: 0, sum: 0, buckets: Array(BUCKETS.length).fill(0) as number[] };
      this.#durations.set(normalizedMethod, duration);
    }
    const safeDuration = Number.isFinite(durationSeconds) && durationSeconds >= 0 ? durationSeconds : 0;
    duration.count += 1;
    duration.sum += safeDuration;
    BUCKETS.forEach((bound, index) => {
      if (safeDuration <= bound) duration.buckets[index] = (duration.buckets[index] ?? 0) + 1;
    });
  }

  renderPrometheus() {
    const lines = [
      '# HELP invitaflow_http_requests_total Number of completed HTTP requests.',
      '# TYPE invitaflow_http_requests_total counter',
    ];
    for (const [key, count] of [...this.#requests].sort(([left], [right]) => left.localeCompare(right))) {
      const [method, status] = key.split('\u0000');
      lines.push(`invitaflow_http_requests_total{method="${method}",status_code="${status}"} ${count}`);
    }

    lines.push('# HELP invitaflow_http_request_duration_seconds HTTP request duration in seconds.');
    lines.push('# TYPE invitaflow_http_request_duration_seconds histogram');
    for (const [method, duration] of [...this.#durations].sort(([left], [right]) => left.localeCompare(right))) {
      BUCKETS.forEach((bound, index) => {
        lines.push(`invitaflow_http_request_duration_seconds_bucket{method="${method}",le="${bound}"} ${duration.buckets[index]}`);
      });
      lines.push(`invitaflow_http_request_duration_seconds_bucket{method="${method}",le="+Inf"} ${duration.count}`);
      lines.push(`invitaflow_http_request_duration_seconds_sum{method="${method}"} ${duration.sum}`);
      lines.push(`invitaflow_http_request_duration_seconds_count{method="${method}"} ${duration.count}`);
    }
    return `${lines.join('\n')}\n`;
  }
}
