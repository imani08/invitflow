# InvitaFlow k6 scenarios

The scripts cover authenticated guest search and cursor pagination, public RSVP, ceremony check-in and invitation batch creation. They emit request failure and p95 thresholds; no latency or throughput result is claimed until a run is performed against a deployed test environment.

## Guest search and pagination

Run `k6 run load-tests/k6/guest-search.js` with `GATEWAY_URL`, `LOAD_TEST_EVENT_ID` and `LOAD_TEST_ACCESS_TOKEN`. The script performs an authenticated one-row preflight, then exercises search and the next cursor when one exists. `LOAD_TEST_GUEST_QUERY` is optional.

## Mutating scenarios

`check-in.js`, `rsvp.js` and `invitation-batches.js` change business data. Run them only against a disposable staging setup after setting both:

```text
LOAD_TEST_ENV=staging
LOAD_TEST_MUTATION_ACK=I_ACCEPT_STAGING_MUTATIONS
```

Check-in also requires a staging event, ceremony, operator token and invitation token. RSVP requires an invitation token and its allowed ceremony IDs. Batch creation requires a staging design, 1–50 staging guest IDs and a wallet with test credits; it queues real renders and reserves credits in that environment. The scripts print neither access nor invitation tokens.

The default threshold is `http_req_duration p(95)<300` ms, matching the standard CRUD target in the cahier des charges. Tune arrival rates and thresholds only for a known environment capacity. Never target production or an event containing real guests.

## Current execution status

`k6` is not installed in the current environment and Docker runtime is unavailable. Scenarios are `NOT_RUN`; no performance result is measured.
