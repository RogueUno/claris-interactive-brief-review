# CLARIS — Make Publisher V1 Blueprint

Status: sandbox contract only. Do not activate production ingress.

## Goal

Make is a transport-only publisher for an already-certified private brief request.

It receives one upstream-produced `publish_ready_body_json`, posts it unchanged to the certified delivery gateway, dedupes notification delivery, sends the server-authored consultant email, and returns a minimal receipt.

Make MUST NOT:
- decide discovery dimensions;
- rewrite PREPARE or Discovery;
- re-score the opportunity;
- receive or reconstruct the full consultant SOT;
- synthesize certification flags;
- rebuild the publish-ready body field-by-field;
- construct private brief URLs itself;
- persist raw private brief URLs/tokens.

## Upstream authority

`publish_ready_body_json` MUST already be the serialized `body` emitted by the certified publication adapter.

The upstream adapter is responsible for:
- PREPARE V3.6 schema enforcement;
- Discovery V1.2 schema enforcement;
- consultant-policy minimization;
- service projection to `service_id + name` only;
- `budget_required_before_first_call` boolean only;
- certification envelope;
- all four PASS gates.

Make transports this body unchanged.

## Mandatory scenario settings

- Keep data confidential: YES.
- On-demand only.
- Do not rely on incomplete-execution payload recovery.
- Do not persist the private URL/token in Make Data Stores.
- Keep production Calendly ingress inactive until Gate G/H certification.

## Scenario input

Required:
- `publish_ready_body_json` — one valid JSON document from the certified upstream adapter.

No other intelligence/profile inputs are accepted by the publisher.

## Step 1 — Publish through delivery gateway

HTTP:
- POST `/api/delivery/package`
- authenticated with existing CLARIS Make credential
- `Content-Type: application/json`
- `X-Claris-Delivery: brief_publish_ready`
- body = `publish_ready_body_json` unchanged

Expected first response:
- HTTP 201
- `ok=true`
- `reused=false`

Expected identical retry:
- HTTP 200
- `ok=true`
- `reused=true`

Response fields used by Make:
- publication_id
- reused
- notification_dedupe_key
- brief.brief_id
- brief.expires_at
- delivery.to
- delivery.subject
- delivery.text_body
- delivery.html_body

The private URL may flow transiently inside the HTTP response/email body but MUST NOT be copied into a persistent Make store.

## Step 2 — Notification dedupe

Dedicated store:
- `CLARIS Premium Brief Delivery Receipts V1`

Key:
- `notification_dedupe_key`

If key exists:
- skip Gmail
- return `SKIPPED_DUPLICATE`

If key does not exist:
- continue to Gmail

The store is intentionally key-only for the first certification pass. It must never contain the private URL/token or full intelligence payload.

## Step 3 — Gmail

Map only the server-authored delivery package:
- To = `delivery.to`
- Subject = `delivery.subject`
- HTML body = `delivery.html_body`

No Make-authored consultant copy.

## Step 4 — Mark SENT

Only after Gmail success:
- add the `notification_dedupe_key` to the dedicated receipt store with overwrite disabled.

If Gmail fails:
- no receipt is written.

## Step 5 — Return receipt

Return:
- status
- publication_id
- reused
- notification_dedupe_key
- brief_id
- expires_at
- delivery_to
- provider_message_id

Do not return:
- full brief payload
- private URL/token
- consultant profile/SOT

## Current live sandbox

Make scenario:
- ID: 7643611
- Name: CLARIS Lab — Premium Brief Publisher V1
- Team: 2357105
- State: INACTIVE
- Confidential execution: enabled
- Receipt store: 199489

First controlled Supabase fixture execution reached the HTTP module and failed `Unauthorized` before Gmail.
The scenario was immediately deactivated.

Because the same CLARIS HTTP keychain is already used by known-good production-domain certifier scenarios, and `main` does not contain `brief_publish_ready`, the remaining live blocker is the protected Vercel branch preview boundary. Do not weaken production or redirect to `main` to bypass it.

## Promotion gate

Publisher sandbox is certified only after:
1. Supabase gold publishes and sends once;
2. Resend gold publishes and sends once;
3. Linear gold publishes and sends once;
4. identical retry skips duplicate Gmail;
5. changed presentation context reuses the same publication;
6. missing/false certification is rejected before persistence;
7. economics leakage is rejected before persistence;
8. revoked publication cannot be resurrected;
9. production Calendly ingress remains inactive throughout certification.
