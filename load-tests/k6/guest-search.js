import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const baseUrl = (__ENV.GATEWAY_URL || '').replace(/\/$/, '');
const eventId = __ENV.LOAD_TEST_EVENT_ID || '';
const token = __ENV.LOAD_TEST_ACCESS_TOKEN || '';
const query = __ENV.LOAD_TEST_GUEST_QUERY || 'Invité';

export const options = {
  scenarios: {
    search: { executor: 'ramping-vus', startVUs: 1, stages: [{ duration: '1m', target: 10 }, { duration: '3m', target: 40 }, { duration: '1m', target: 0 }] },
    pagination: { executor: 'constant-vus', vus: 3, duration: '5m', startTime: '30s' },
  },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<300'] },
};

export function setup() {
  if (!baseUrl || !/^https?:\/\//.test(baseUrl) || !eventId || !token) fail('Set GATEWAY_URL, LOAD_TEST_EVENT_ID and LOAD_TEST_ACCESS_TOKEN for a dedicated test event.');
  const response = http.get(`${baseUrl}/v1/events/${encodeURIComponent(eventId)}/guests?limit=1`, { headers: { Authorization: `Bearer ${token}` }, tags: { name: 'guest-list-smoke' } });
  if (response.status !== 200) fail(`Guest endpoint preflight failed with HTTP ${response.status}.`);
  return { baseUrl, eventId, token };
}

export function search(data) {
  const response = http.get(`${data.baseUrl}/v1/events/${encodeURIComponent(data.eventId)}/guests?limit=50&q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${data.token}` }, tags: { name: 'guest-search' } });
  check(response, { 'guest search returns 200': (result) => result.status === 200, 'guest search returns an items array': (result) => Array.isArray(result.json('items')) });
  sleep(1);
}

export function pagination(data) {
  const headers = { Authorization: `Bearer ${data.token}` };
  const first = http.get(`${data.baseUrl}/v1/events/${encodeURIComponent(data.eventId)}/guests?limit=50`, { headers, tags: { name: 'guest-page-first' } });
  const valid = check(first, { 'first guest page returns 200': (result) => result.status === 200, 'first guest page has items': (result) => Array.isArray(result.json('items')) });
  if (!valid) return;
  const cursor = first.json('nextCursor');
  if (typeof cursor === 'string' && cursor.length > 0) {
    const next = http.get(`${data.baseUrl}/v1/events/${encodeURIComponent(data.eventId)}/guests?limit=50&cursor=${encodeURIComponent(cursor)}`, { headers, tags: { name: 'guest-page-next' } });
    check(next, { 'next guest page returns 200': (result) => result.status === 200, 'next guest page has items': (result) => Array.isArray(result.json('items')) });
  }
  sleep(1);
}
