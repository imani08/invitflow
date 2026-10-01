import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const baseUrl = (__ENV.GATEWAY_URL || '').replace(/\/$/, '');
const invitationToken = __ENV.LOAD_TEST_INVITATION_TOKEN || '';
const ceremonyIds = (__ENV.LOAD_TEST_CEREMONY_IDS || '').split(',').filter(Boolean);

export const options = {
  scenarios: { rsvp: { executor: 'constant-vus', vus: 5, duration: '3m' } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<300'] },
};

export function setup() {
  if (__ENV.LOAD_TEST_ENV !== 'staging' || __ENV.LOAD_TEST_MUTATION_ACK !== 'I_ACCEPT_STAGING_MUTATIONS') fail('RSVP load changes invitation responses; use only a disposable staging invitation and set the explicit staging mutation acknowledgement.');
  if (!baseUrl || !/^https?:\/\//.test(baseUrl) || !invitationToken || ceremonyIds.length < 1 || ceremonyIds.length > 30) fail('Set GATEWAY_URL, a staging invitation token and its allowed ceremony IDs.');
  return { baseUrl, invitationToken, ceremonyIds };
}

export default function (data) {
  const body = { responses: data.ceremonyIds.map((ceremonyId) => ({ ceremonyId, status: 'ACCEPTED', attendingCompanions: 0 })) };
  const response = http.post(`${data.baseUrl}/v1/public/invitations/${encodeURIComponent(data.invitationToken)}/rsvp`, JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, tags: { name: 'public-rsvp' } });
  check(response, { 'RSVP response accepted': (result) => result.status === 200 });
  sleep(1);
}
