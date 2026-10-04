# CLARIS Private Brief Lifecycle V1

## Status
Sandbox/premium branch contract. Production PREPARE, FINALIZE and Calendly ingress remain unchanged.

## Goal
Publish only certified CLARIS Premium PREPARE + Discovery Intelligence artifacts to a private consultant brief, then send a compact notification email containing the opaque private link.

## Preconditions
Inputs already exist:
- opportunity_id
- consultant_id
- consultant delivery email
- consultant first name
- company
- prospect name when known
- meeting time when known
- CLARIS_PREMIUM_PREPARE_V3_6 artifact
- CLARIS_DISCOVERY_INTELLIGENCE_V1_2 artifact
- minimal validation context: consultant service IDs/names + budget-required-before-first-call boolean

No publication occurs before deterministic delivery validation.

## One Vercel gateway

All operations use:

POST /api/delivery/package

The project remains within the Vercel Hobby function limit because private brief operations are multiplexed through this existing function. Do not add separate /api/brief/* functions on Hobby.

---

# Preferred Make path — one HTTP call + Gmail

## Step 1 — Publish and build notification atomically

POST /api/delivery/package

Headers:
- Authorization: Bearer <existing CLARIS_MAKE_KEY>
- X-Claris-Delivery: brief_publish_ready
- Content-Type: application/json

Body:

{
  "opportunity_id": "...",
  "consultant_id": "...",
  "consultant_delivery_email": "...",
  "consultant_first_name": "...",
  "company": "...",
  "prospect_name": "...",
  "meeting_time": "...",
  "ttl_days": 7,
  "brief_payload": {
    "prepare": { "schema_version": "CLARIS_PREMIUM_PREPARE_V3_6", "...": "..." },
    "discovery": { "schema_version": "CLARIS_DISCOVERY_INTELLIGENCE_V1_2", "...": "..." }
  },
  "validation_context": {
    "services": [
      { "service_id": "...", "name": "..." }
    ],
    "commercial_rules": {
      "budget_required_before_first_call": false
    }
  }
}

Server order:
1. authenticate existing Make/Admin key;
2. preflight the consultant email package;
3. deterministically validate PREPARE/Discovery authority, service IDs and economics rules;
4. persist brief + hashed access token only;
5. generate opaque fragment URL;
6. build compact CONSULTANT_BRIEF_READY delivery package;
7. return both brief metadata and email package.

Success:

HTTP 201

{
  "ok": true,
  "brief": {
    "brief_id": "...",
    "brief_url": "https://.../brief-v1/#brief=<opaque>",
    "expires_at": "..."
  },
  "delivery": {
    "schema_version": "claris_delivery_package_v1",
    "kind": "CONSULTANT_BRIEF_READY",
    "channel": "EMAIL",
    "to": "...",
    "subject": "...",
    "text_body": "...",
    "metadata": { "...": "..." }
  }
}

The response deliberately does not expose brief_token as a second top-level field. The opaque token exists only inside the private URL.

## Step 2 — Gmail

Map directly:
- To = delivery.to
- Subject = delivery.subject
- Body = delivery.text_body

Do not reconstruct the email in Make.

The email contains:
- compact executive readout;
- at most 3 decisive questions;
- private brief URL;
- optional expiry.

It does NOT contain:
- full PREPARE artifact;
- expandable evidence;
- full Discovery Intelligence plan;
- consultant private calibration/SOT.

## Step 3 — Receipt

Persist/log only:
- opportunity_id
- brief_id
- consultant_id
- company
- expires_at
- email send status
- delivered_at

Do not separately persist the opaque access token.
Do not copy the full brief into the receipt.

---

# Fail-closed routing

brief_publish_ready must not fall back to legacy CONSULTANT_FINAL.

- HTTP 401: Make/Admin authorization failure -> STOP.
- HTTP 422: notification preflight or deterministic artifact validation failure -> STOP; no email.
- HTTP 500: infrastructure failure -> STOP; no full-brief fallback.

If Gmail fails after HTTP 201:
- brief remains valid but undelivered;
- record delivery failure;
- retry Gmail with the already-returned delivery package where workflow retry semantics permit;
- do not generate a second brief merely because email delivery failed.

---

# Browser access flow

Consultant opens:

/brief-v1/#brief=<opaque-token>

Client:
1. reads fragment token;
2. removes fragment from browser history immediately;
3. POSTs token to /api/delivery/package with X-Claris-Delivery: brief_resolve;
4. receives HttpOnly + Secure + SameSite=Strict session cookie;
5. POSTs /api/delivery/package with X-Claris-Delivery: brief_data;
6. renders server-returned brief payload.

No valid token/session:
- fail closed with private-link gate.

Expired/revoked:
- fail closed; request a fresh brief.

The fragment is not sent in the browser's initial HTTP request and Referrer-Policy is no-referrer.

---

# Revocation

POST /api/delivery/package

Headers:
- Authorization: Bearer <CLARIS_MAKE_KEY or CLARIS_ADMIN_KEY>
- X-Claris-Delivery: brief_revoke

Body:
{
  "brief_id": "..."
}

Revocation immediately invalidates:
- future token resolves;
- already-issued sessions, because every brief_data load rechecks brief status.

---

# Data minimization

Delivery validation receives only:
- service_id
- service name
- budget_required_before_first_call boolean

Do not send:
- rich consultant profile;
- private notes;
- service margins/economics;
- commercial floor unless a future deterministic validator explicitly requires it;
- unrelated calibration answers.

The future Node runtime may use brief-v1/server/publication-contract.mjs to compile the same minimized boundary.

---

# Modular operations retained

These remain supported for testing/future runtimes:
- brief_create
- CONSULTANT_BRIEF_READY
- brief_resolve
- brief_data
- brief_revoke

Preferred Make MVP path is still:
brief_publish_ready -> Gmail.

---

# Promotion acceptance

Private Brief Lifecycle V1 is promotable only when:
1. Vercel preview build succeeds.
2. brief server tests pass.
3. consolidated gateway tests pass.
4. publication-contract tests pass.
5. publish-ready preflight failure leaves no persisted brief.
6. anonymous brief_data fails 401.
7. invalid/expired/revoked access fails closed.
8. a deliberately bad premium payload is rejected before persistence.
9. consultant email contains summary + questions + private URL, not full brief.
10. legacy PROSPECT_CLARIFICATION and CONSULTANT_FINAL packaging remains valid.
11. production Calendly ingress remains inactive until end-to-end certification is complete.
