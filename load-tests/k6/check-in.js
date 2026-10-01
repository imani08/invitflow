import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const baseUrl = (__ENV.GATEWAY_URL || '').replace(/\/$/, '');
const eventId = __ENV.LOAD_TEST_EVENT_ID || '';
const ceremonyId = __ENV.LOAD_TEST_CEREMONY_ID || '';
const token = __ENV.LOAD_TEST_ACCESS_TOKEN || '';
const invitationToken = __ENV.LOAD_TEST_INVITATION_TOKEN || '';

export const options = {
  scenarios: { checkin: { executor: 'ramping-vus', startVUs: 1, stages: [{ duration: '30s', target: 5 }, { duration: '2m', target: 20 }, { duration: '30s', target: 0 }] } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<300'] },
};

export function setup() {
  if (__ENV.LOAD_TEST_ENV !== 'staging' || __ENV.LOAD_TEST_MUTATION_ACK !== 'I_ACCEPT_STAGING_MUTATIONS') fail('Check-in load changes attendance; set LOAD_TEST_ENV=staging and LOAD_TEST_MUTATION_ACK=I_ACCEPT_STAGING_MUTATIONS only for a disposable staging event.');
  if (!baseUrl || !/^https?:\/\//.test(baseUrl) || !eventId || !ceremonyId || !token || !invitationToken) fail('Set GATEWAY_URL, event/ceremony IDs, access token and a dedicated staging invitation token.');
  return { baseUrl, eventId, ceremonyId, token, invitationToken };
}

export default function (data) {
  const response = http.post(`${data.baseUrl}/v1/events/${encodeURIComponent(data.eventId)}/check-in/scan`, JSON.stringify({ token: data.invitationToken, ceremonyId: data.ceremonyId, companionCount: 0 }), { headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json', 'X-Checkin-Device-Id': 'k6-staging' }, tags: { name: 'check-in-scan' } });
  check(response, { 'check-in scan accepted or recorded as duplicate': (result) => result.status === 200 });
  sleep(1);
}
