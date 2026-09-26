# CLARIS Make Sandbox — Private Brief Publisher V1

## Purpose
Instantiate this only as an inactive sandbox until Private Brief Lifecycle V1 is certified end-to-end.

Preferred path is intentionally small:

StartSubscenario
→ deterministic publish-ready payload mapping
→ HTTP: brief_publish_ready
→ Gmail: Send an email
→ Return receipt

Canonical server-side equivalent: compileBriefPublishReady() in brief-v1/server/publication-contract.mjs. Make must map the same minimized fields and must not transmit the full consultant SOT.

Do not insert PREPARE/Discovery reasoning into this scenario.
Do not modify frozen 7360890 or 7527099.
Do not activate Calendly ingress 7081477.

## Inputs

Required:
- opportunity_id
- consultant_id
- consultant_delivery_email
- consultant_first_name
- company
- prepare_json = CLARIS_PREMIUM_PREPARE_V3_6
- discovery_json = CLARIS_DISCOVERY_INTELLIGENCE_V1_2
- consultant_services_projection = service_id + name only
- budget_required_before_first_call = boolean only

Do not accept the full consultant SOT as a publisher input when the minimized projection is available.

Optional:
- prospect_name
- meeting_time
- ttl_days (default 7)

Server credential:
- existing CLARIS Make authorization, held only in Make/server configuration.
- never pass the key as a scenario input or expose it in notes/output.

## Module 1 — StartSubscenario

Accept inputs above.

Fail if required identity/delivery/artifact inputs are absent.

## Module 2 — HTTP publish-ready

POST:
<delivery gateway base>/api/delivery/package

Headers:
- Authorization: Bearer <existing CLARIS Make key>
- X-Claris-Delivery: brief_publish_ready
- Content-Type: application/json

Body:

{
  "opportunity_id": "{{opportunity_id}}",
  "consultant_id": "{{consultant_id}}",
  "consultant_delivery_email": "{{consultant_delivery_email}}",
  "consultant_first_name": "{{consultant_first_name}}",
  "company": "{{company}}",
  "prospect_name": "{{prospect_name}}",
  "meeting_time": "{{meeting_time}}",
  "ttl_days": 7,
  "brief_payload": {
    "prepare": <parsed prepare_json>,
    "discovery": <parsed discovery_json>
  },
  "validation_context": {
    "services": <service_id + name only>,
    "commercial_rules": {
      "budget_required_before_first_call": <boolean>
    }
  }
}

Expected HTTP 201.

Response:
{
  "ok": true,
  "brief": {
    "brief_id": "...",
    "brief_url": "...#brief=<opaque>",
    "expires_at": "..."
  },
  "delivery": {
    "kind": "CONSULTANT_BRIEF_READY",
    "to": "...",
    "subject": "...",
    "text_body": "...",
    "html_body": "...",
    "metadata": { ... }
  }
}

### HTTP failure routing

401:
- status = PUBLISH_AUTH_FAILED
- stop
- do not email
- do not fall back to CONSULTANT_FINAL

422:
- status = PUBLISH_VALIDATION_FAILED
- preserve returned error codes for internal diagnosis
- stop
- do not email

5xx:
- status = PUBLISH_INFRA_FAILED
- allow normal bounded scenario retry policy
- do not email until a 201 exists
- do not fall back to full brief email

## Module 3 — Gmail Send Email

Run only after Module 2 returns HTTP 201 and body.ok=true.

Map:
- To = delivery.to
- Subject = delivery.subject
- HTML/content body = delivery.html_body when the Gmail module supports HTML
- plain text fallback = delivery.text_body

Do not rebuild the email inside Make.
Do not inject the full PREPARE/Discovery JSON.

### Gmail failure routing

If publication succeeded but Gmail fails:
- status = BRIEF_PUBLISHED_EMAIL_FAILED
- retain brief_id / expires_at in the execution receipt
- retry the Gmail action using the existing Module 2 output where Make retry semantics allow
- do NOT call brief_publish_ready again solely because Gmail failed
- do NOT create a second private brief for the same delivery retry

## Module 4 — Return receipt

Return only:

{
  "status": "DELIVERED",
  "opportunity_id": "...",
  "brief_id": "...",
  "company": "...",
  "expires_at": "...",
  "delivery_to": "...",
  "delivery_kind": "CONSULTANT_BRIEF_READY"
}

Do not return:
- full brief payload
- consultant SOT
- validation_context
- separate raw token
- HTML body unless required for immediate retry handling

## Data minimization contract

validation_context contains only:
- services: service_id + name
- commercial_rules.budget_required_before_first_call

Do not send:
- minimum engagement floor unless a later deterministic server validator explicitly requires it
- private consultant notes
- service margins/economics
- unrelated calibration fields

## Certification run order

1. Supabase rich-booking fixture
2. Resend sparse API-security fixture
3. Linear enterprise-review fixture

For each:
- use already-certified prepare/discovery fixture first;
- publish;
- inspect returned delivery package;
- send only to pilot consultant address;
- verify private link opens;
- verify refresh resumes session;
- revoke test copy and verify existing session fails;
- record receipt.

Only after fixture certification should live PREPARE/Discovery outputs feed the publisher.

## Promotion rule

Do not connect this publisher to Production Booking Adapter or Calendly until:
- 3/3 fixtures publish successfully;
- server deterministic gate rejects mutated bad fixtures;
- email HTML/text both verified;
- private link/session/revocation verified;
- no duplicate brief is created on email retry;
- production frozen scenarios remain unchanged.


## Certified server contract — 2026-09-26

The server side of this handoff is already certified on the premium branch:

- Vercel preview build: PASS
- GitHub Actions Node 22 private-brief suite: 18/18 PASS
- brief_publish_ready integration: PASS
- legacy CONSULTANT_FINAL delivery compatibility: PASS
- economics leakage rejection before persistence: PASS
- invalid service mapping rejection before persistence: PASS
- post-persist notification packaging failure revokes the orphan brief: PASS
- API function count remains 12, preserving Vercel Hobby deployment

The only currently unexecuted piece is the live Make scenario because the Make fallback connector is returning internal errors.

## Duplicate-prevention rule

If Module 2 returned HTTP 201, treat its brief and delivery objects as the canonical publication result for that scenario execution.

If Gmail fails:
- retry Gmail from the retained Module 2 response;
- never rerun brief_publish_ready just to retry email;
- never fall back to the legacy full-brief email;
- surface BRIEF_PUBLISHED_EMAIL_FAILED if the email cannot be recovered.

A later lifecycle hardening pass may add cross-execution idempotency, but that is not required to certify the first controlled pilot when Make error handling is configured at the Gmail module boundary.
