const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5] as const;
const SAFE_ROUTE = /^\/[a-zA-Z0-9_:/{}.*-]{0,199}$/;

type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'OTHER';
type Duration = { method: Method; route: string; count: number; sum: number; buckets: number[] };

function normalizeRoute(route: unknown) {
  return typeof route === 'string' && SAFE_ROUTE.test(route) ? route : 'unknown';
}

export class HttpMetrics {
  readonly #requests = new Map<string, number>();
  readonly #durations = new Map<string, Duration>();

  record(method: string, statusCode: number, durationSeconds: number, route?: unknown) {
    const normalizedMethod: Method = METHODS.has(method) ? method as Method : 'OTHER';
    const normalizedStatus = Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599 ? statusCode : 500;
    const normalizedRoute = normalizeRoute(route);
    const requestKey = `${normalizedMethod}\u0000${normalizedStatus}\u0000${normalizedRoute}`;
    this.#requests.set(requestKey, (this.#requests.get(requestKey) ?? 0) + 1);

    const durationKey = `${normalizedMethod}\u0000${normalizedRoute}`;
    let duration = this.#durations.get(durationKey);
    if (!duration) {
      duration = {
        method: normalizedMethod,
        route: normalizedRoute,
        count: 0,
        sum: 0,
        buckets: Array(BUCKETS.length).fill(0) as number[],
      };
      this.#durations.set(durationKey, duration);
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
      const [method, status, route] = key.split('\u0000');
      lines.push(`invitaflow_http_requests_total{method="${method}",route="${route}",status_code="${status}"} ${count}`);
    }

    lines.push('# HELP invitaflow_http_request_duration_seconds HTTP request duration in seconds.');
    lines.push('# TYPE invitaflow_http_request_duration_seconds histogram');
    for (const duration of [...this.#durations.values()].sort((left, right) =>
      `${left.method}\u0000${left.route}`.localeCompare(`${right.method}\u0000${right.route}`),
    )) {
      const labels = `method="${duration.method}",route="${duration.route}"`;
      BUCKETS.forEach((bound, index) => {
        lines.push(`invitaflow_http_request_duration_seconds_bucket{${labels},le="${bound}"} ${duration.buckets[index]}`);
      });
      lines.push(`invitaflow_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${duration.count}`);
      lines.push(`invitaflow_http_request_duration_seconds_sum{${labels}} ${duration.sum}`);
      lines.push(`invitaflow_http_request_duration_seconds_count{${labels}} ${duration.count}`);
    }
    return `${lines.join('\n')}\n`;
  }
}
