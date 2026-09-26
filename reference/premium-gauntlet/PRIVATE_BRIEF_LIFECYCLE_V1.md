# CLARIS Private Brief Lifecycle V1

## Status
Sandbox/premium branch contract. Production PREPARE, FINALIZE and Calendly ingress remain unchanged.

## Goal
Publish only certified CLARIS Premium PREPARE + Discovery Intelligence artifacts to a private consultant brief, then send a compact notification email containing the opaque private link.

## Preconditions
Inputs must already exist:
- opportunity_id
- consultant_id
- consultant delivery email
- consultant first name
- company
- prospect name when known
- meeting time when known
- CLARIS_PREMIUM_PREPARE_V3_6 artifact
- CLARIS_DISCOVERY_INTELLIGENCE_V1_2 artifact
- consultant SOT

No publication occurs before deterministic delivery validation.

## One gateway
All operations use:

POST /api/delivery/package

Server-to-server operations require the existing CLARIS Make/Admin authorization boundary.

The project remains within the Vercel Hobby function limit because private brief operations are multiplexed through this existing function.

---

## Step 1 — Compile publication payload

Deterministic compiler:
brief-v1/server/publication-contract.mjs
compileBriefPublication(...)

Output:

operation = brief_create

body:
{
  "consultant_id": "...",
  "company": "...",
  "ttl_days": 7,
  "brief_payload": {
    "prepare": { CLARIS_PREMIUM_PREPARE_V3_6 },
    "discovery": { CLARIS_DISCOVERY_INTELLIGENCE_V1_2 }
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

Data minimization:
- do not send rich calibration/profile data;
- do not send private consultant notes;
- do not send service economics/margins;
- do not send commercial floor when it is not required by delivery validation;
- send only service IDs/names and the explicit budget-required boolean.

## Step 2 — Publish private brief

Headers:
Authorization: Bearer <existing CLARIS_MAKE_KEY>
X-Claris-Delivery: brief_create
Content-Type: application/json

Body:
compiled Step 1 body.

Success:
HTTP 201
{
  "ok": true,
  "brief_id": "...",
  "brief_token": "...",
  "brief_url": "https://.../brief-v1/#brief=<opaque>",
  "expires_at": "..."
}

Important:
- raw access token is never stored in Vercel Blob;
- only SHA-256 token hash is persisted;
- brief payload is stored server-side;
- URL fragment is not sent by the browser in the initial HTTP request.

Fail closed:
- HTTP 401 -> server authorization failure; do not send email.
- HTTP 422 -> deterministic artifact validation failure; do not send email.
- HTTP 500 -> infrastructure failure; do not silently fall back to legacy full-brief email.

## Step 3 — Compile notification

After brief_create succeeds, call:

compileBriefReadyNotification(...)

It binds:
- brief_id
- brief_url
- expires_at

to:
- consultant email/name
- company/prospect
- meeting
- PREPARE executive_readout
- first 2–3 Discovery primary questions

Output operation:
CONSULTANT_BRIEF_READY

The full intelligence artifact does NOT enter the email.

## Step 4 — Build consultant email package

POST /api/delivery/package

Headers:
Authorization: Bearer <existing CLARIS_MAKE_KEY>
X-Claris-Delivery: CONSULTANT_BRIEF_READY
Content-Type: application/json

Body:
compiled notification body.

Success:
HTTP 200
{
  "ok": true,
  "delivery": {
    "kind": "CONSULTANT_BRIEF_READY",
    "channel": "EMAIL",
    "to": "...",
    "subject": "...",
    "text_body": "...",
    "metadata": { ... }
  }
}

Make maps delivery.to / subject / text_body into the existing Gmail send action.

## Step 5 — Delivery receipt

Persist/log only:
- opportunity_id
- brief_id
- consultant_id
- company
- expires_at
- delivery status
- delivered_at

Avoid separately persisting brief_token.
Do not copy the full brief into the delivery receipt.

## Browser flow

Consultant opens:

/brief-v1/#brief=<opaque-token>

Client:
1. reads fragment token;
2. removes the fragment from browser history immediately;
3. POSTs token to /api/delivery/package with X-Claris-Delivery: brief_resolve;
4. receives HttpOnly + Secure + SameSite=Strict session cookie;
5. POSTs /api/delivery/package with X-Claris-Delivery: brief_data;
6. renders server-returned brief payload.

No token/session:
- page fails closed with “A private brief link is required.”

Expired/revoked:
- fail closed; request a fresh brief.

## Revocation

Server-to-server:

POST /api/delivery/package
Authorization: Bearer <CLARIS_MAKE_KEY or CLARIS_ADMIN_KEY>
X-Claris-Delivery: brief_revoke

{
  "brief_id": "..."
}

Revocation immediately invalidates:
- future token resolves;
- already-issued sessions, because every brief_data load rechecks brief status.

## Promotion acceptance

Private Brief Lifecycle V1 is promotable only when:
1. Vercel preview build succeeds.
2. brief server tests pass.
3. consolidated gateway tests pass.
4. publication-contract tests pass.
5. anonymous brief_data fails 401.
6. invalid/expired/revoked access fails closed.
7. a deliberately bad premium payload is rejected before persistence.
8. consultant email contains summary + questions + private URL, not full brief.
9. legacy PROSPECT_CLARIFICATION and CONSULTANT_FINAL packaging remains valid.
10. production Calendly ingress remains inactive until end-to-end certification is complete.
