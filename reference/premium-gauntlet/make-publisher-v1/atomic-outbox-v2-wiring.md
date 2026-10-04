# CLARIS Premium V5 publisher — atomic outbox candidate

**Status:** implementation and CI on draft branch. NOT deployed to production. Keep publisher scenario 7643611 inactive and PREPARE/FINALIZE 7360890 frozen.

## Existing duplicate window
Current publisher: HTTP publication (#3) → legacy Data Store ExistRecord (#4) → if absent Gmail (#6) → Data Store AddRecord (#8). The receipt is created after Gmail, so two concurrent runs or a successful Gmail call with a lost response can create duplicate sends. Historical receipts in Data Store 199489 must be preserved.

## New server contract
Use the existing authenticated POST /api/delivery/package endpoint, with X-Claris-Delivery set to one of the following:

**brief_notification_claim**, JSON:
```json
{
  "publication_id": "{{3.data.publication_id}}",
  "brief_id": "{{3.data.brief.brief_id}}",
  "consultant_id": "{{3.data.consultant_id}}",
  "consultant_delivery_email": "{{3.data.delivery.to}}",
  "notification_dedupe_key": "{{3.data.notification_dedupe_key}}",
  "brief_url": "{{3.data.brief.brief_url}}"
}
```
The server validates publication existence/active status, URL origin and token identity, consultant identity and locked READY Runtime, and the email registered to that consultant. It atomically writes a private, create-only receipt under a deterministic publication ID. CLAIMED is the **only** response allowing Gmail; BLOCKED, RECONCILIATION_REQUIRED, SKIPPED_ALREADY_SENT, timeout, unknown response and all HTTP errors must stop without sending.

**brief_notification_ack**, only after Gmail positively returns its provider message ID:
```json
{
  "publication_id": "{{3.data.publication_id}}",
  "claim_token": "{{claim.data.claim_token}}",
  "provider_message_id": "{{gmail.id}}"
}
```
ACKNOWLEDGED means the provider-confirmed message was recorded. A missing/ambiguous ACK remains reserved; never automatically retry Gmail.

## Proposed Make graph (inactive until promotion)
1. Keep #3 publish-ready HTTP and #4 legacy Data Store receipt check. If old receipt exists, return SKIPPED_LEGACY_SENT; no claim or email.
2. On legacy absence, execute new claim HTTP with the SAME authenticated keychain and X-Claris-Delivery: brief_notification_claim. Require HTTP 200, data.ok=true, data.status=CLAIMED for any send branch; all other responses terminate.
3. Reuse #6 Gmail using recipient {{claim.data.consultant_delivery_email}}, existing server-produced subject {{3.data.delivery.subject}} and HTML {{3.data.delivery.html_body}}. Never insert unescaped user or model text. Keep the private brief link secret.
4. After Gmail success and returned {{6.id}}, execute new ACK HTTP with X-Claris-Delivery: brief_notification_ack. ACK success only after data.status=ACKNOWLEDGED.
5. Preserve #8 Data Store AddRecord(overwrite:false) **after** ACK to keep legacy bookkeeping for the same notification key; #9 ReturnData reports DELIVERED only after ACK. Separate duplicate/reconciliation/blocked returns; do not label every nonclaimed attempt a duplicate.
6. Preserve the old blueprint as rollback; do not run Gmail, activate the publisher, or alter production API secrets until the isolated security server patch has been promoted, current branch CI passed, and full negative tests approved.

## Boundaries
- At most one authorized send attempt per V5 publication, **not** proven exactly-once email delivery. Uncertain sends require operator reconciliation rather than an automatic retry.
- Vercel Blob supports allowOverwrite:false create-only semantics and ifMatch ETag updates; contention is verified with an in-memory mock, not a live load test.
- The existing Premium publication can update context on an identical retry; separately certify whether this is safe for a previously emailed brief.
- Submitted-clarification and immediate-final legacy delivery are separate Make paths; this V5 outbox does not silently secure them.

## Tests
- brief-v1/server/tests/notification-outbox.test.mjs: 16 simultaneous claims, corrupt and uncertain states, locked tenant/recipient, token and domain mismatch, ACK replay/conflict.
- brief-v1/server/tests/delivery-gateway.test.mjs: authenticated claim/ACK HTTP transport.
- Premium Brief Branch CI must be green on the exact candidate commit before deployment.