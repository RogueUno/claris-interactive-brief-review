# V2.3 prospect-submission delivery integration — protected handoff
**Status:** Preview implementation + offline certified; no production send or live Make wiring. Gemini/Tavily/Gmail operations: **zero** for this implementation.

## Prerequisites

- Safely integrate only isolated branch `v23-delivery-owner-gate-20261004` into production (not large PR #6); pass owner-safety CI and inspect target deployment revision. Promotion tooling was previously blocked; do **not** overwrite main or promote the unrelated preview as a workaround.
- Confirm production Server Runtime has `CLARIS_MAKE_KEY`, `CLARIS_SESSION_SECRET`, the same private Blob store, and locked consultant identities. Never export their actual values into the repository.
- Keep `7360890` PREPARE/FINALIZE frozen and Calendly scenario `7081477` inactive.
- Existing prospect continuation `7525730` is **ACTIVE** with fixed legacy recipient. Do not rewire it piecemeal while awaiting server promotion.

## Required proposed Make execution sequence

1. **Webhook** existing `7525730` module 1: only untrusted `opportunity_id`; must validate source/identity on server. Never trust recipient from incoming webhook.
2. **Preflight before any Gemini**: authenticated POST `/api/clarification/admin/package` with header `x-claris-operation: FINAL_DELIVERY_PREFLIGHT` and JSON `{"opportunity_id":"<module 1 ID>"}`. Only `data.status === "ELIGIBLE" && data.ok === true` may proceed. `SKIPPED_ALREADY_SENT` → exit harmlessly, `RECONCILIATION_REQUIRED` → operator review, `BLOCKED` → no provider call.
3. Existing call to `7527099` with `lifecycle_action=FINALIZE_SUBMITTED`. It receives *only* the opportunity ID; validated PREPARE, answers and consultant SOT come from persisted private server context. Accept only `status=FINALIZED`, `final_brief_markdown` present, and a true PASS audit.
4. **Atomic claim before Gmail**: authenticated POST to same admin API with `x-claris-operation: FINAL_DELIVERY_CLAIM` and JSON `{"opportunity_id":"<module 1 ID>","status":"FINALIZED","final_brief_markdown":"<returned text>","final_audit_json":"<returned audit JSON>"}`. The server rechecks the locked Runtime owner, stored submitted clarification, SOT, and certification. The CAS-backed receipt allows one `CLAIMED` result. Only this result authorizes sending.
5. Gmail `google-email:sendAnEmail`: **recipient from claim `data.consultant_delivery_email`**, subject `data.email_subject`, rawHtml body **only** from escaped `data.email_html`. No hardcoded recipient and no interpolation of unescaped model Markdown. Historical output of this exact Gmail module has a message `id` field.
6. **ACK after confirmed Gmail success**: authenticated POST `FINAL_DELIVERY_ACK` with `{"opportunity_id":"...","claim_token":"<claim.data.claim_token>","provider_message_id":"<Gmail.id>"}`. A matching repeated ACK returns `ACKNOWLEDGED,reused=true`; a different message or token fails closed.
7. If Gmail times out, is interrupted, or ACK fails, leave `RESERVED` in place; do not automatically release/retry. Reconcile the provider message ID manually before any controlled intervention. This is at-most-one authorized send attempt, **not** mathematically guaranteed exactly-once delivery.
8. Never log claim tokens, consultant SOT, raw prospect answers or unredacted private body. Reserve claims do not auto-expire; public prospect endpoints cannot access these operations.

All HTTP operations require the existing Make server-side API authentication/keychain. In Make, make error handling distinguish business 409/422 from transport failures; neither may fall through to a Gmail module.

## Scope limit: Zero-clarification bookings

The new receipt lives on a persisted **SUBMITTED clarification envelope**. Zero-question PREPARE→FINALIZE produces no such envelope, so this claim API is **not a substitute for the zero-question publisher**. The immediate-final Booking Adapter currently sends by Gmail separately. That path must use a comparably atomic reservation/publisher receipt before production activation; simply checking Data Store `ExistRecord` and writing after send is insufficient under concurrent duplicates.

The separate Premium Brief Publisher `7643611` is inactive; its existing `ExistRecord → Gmail → AddRecord` branch currently writes the dedupe receipt **after** Gmail. It also cannot guarantee single-send behavior under a race or lost acknowledgment. Preserve it and repair its guard transaction before making it the single production path.

## Evidence

- Isolated source: `clarification-v1/server/final-delivery-receipt.mjs`.
- CI: `V2.3 Delivery Ownership Safety` checks private identity, offline submission, concurrent claims, wrong tenant, corrupt receipt, lost ACK and HTML escaping, and no additional known FINALIZE regressions.
- No external provider, live webhook, or Gmail execution is part of this test.
