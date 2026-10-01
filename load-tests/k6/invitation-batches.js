import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const baseUrl = (__ENV.GATEWAY_URL || '').replace(/\/$/, '');
const eventId = __ENV.LOAD_TEST_EVENT_ID || '';
const token = __ENV.LOAD_TEST_ACCESS_TOKEN || '';
const designId = __ENV.LOAD_TEST_DESIGN_ID || '';
let guestIds = [];
try { guestIds = JSON.parse(__ENV.LOAD_TEST_GUEST_IDS || '[]'); } catch { /* setup reports invalid input without exposing values */ }

export const options = {
  scenarios: { batches: { executor: 'constant-arrival-rate', rate: 1, timeUnit: '1m', duration: '3m', preAllocatedVUs: 1, maxVUs: 3 } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<300'] },
};

export function setup() {
  if (__ENV.LOAD_TEST_ENV !== 'staging' || __ENV.LOAD_TEST_MUTATION_ACK !== 'I_ACCEPT_STAGING_MUTATIONS') fail('Batch generation reserves credits and queues rendering; use only a disposable staging wallet/event with the explicit mutation acknowledgement.');
  if (!baseUrl || !/^https?:\/\//.test(baseUrl) || !eventId || !token || !designId || !Array.isArray(guestIds) || guestIds.length < 1 || guestIds.length > 50 || guestIds.some((id) => typeof id !== 'string')) fail('Set the staging URL, event/design IDs, access token and 1-50 staging guest IDs.');
  return { baseUrl, eventId, token, designId, guestIds };
}

export default function (data) {
  const response = http.post(`${data.baseUrl}/v1/events/${encodeURIComponent(data.eventId)}/invitations/batches`, JSON.stringify({ designId: data.designId, guestIds: data.guestIds }), { headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': `k6-staging-${__VU}-${__ITER}` }, tags: { name: 'invitation-batch-create' } });
  check(response, { 'invitation batch accepted': (result) => [200, 201, 202].includes(result.status) });
  sleep(1);
}
