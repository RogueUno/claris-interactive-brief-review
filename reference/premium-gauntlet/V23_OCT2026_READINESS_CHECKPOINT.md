# CLARIS V2.3 reliability checkpoint — 2026-10-04

Status: read-only inspection prior to any remediation. This file is a rollback-oriented summary, **not** a certified freeze or an export of secret-bearing Make blueprints.

## Read-only structural snapshot
- Frozen governed PREPARE/FINALIZE: Make scenario `7360890`, active, lastEdit `2026-10-01T21:43:42.969Z`; **do not edit**.
- Governed lifecycle V2.3: `7527099`, active, lastEdit `2026-09-21T17:45:08.123Z`. Current clarification Gemini mappings: proposer + repair `gemini-3.1-flash-lite`; verifier `gemini-3-flash-preview`. Both PREPARE and FINALIZE call the frozen `7360890`; no changes authorized to intelligence semantics.
- Production Booking Adapter: `7533518`, active, lastEdit `2026-09-22T23:22:54.164Z`. Module 2 fetches authenticated locked consultant Runtime V3; module 3 calls `7527099`. Module 3 consultant first name is hard-coded; module 7 consultant final destination is hard-coded. Prospect clarification module 6 dynamically targets prospect address.
- Prospect Submission Continuation: `7525730`, active, lastEdit `2026-09-22T18:55:42.269Z`. Webhook → V2.3 FINALIZE_SUBMITTED → Gmail; final-delivery recipient is hard-coded, while the authenticated FINALIZE bundle doesn't yet return a delivery address.
- Calendly Production Ingress: `7081477`, **inactive**, lastEdit `2026-09-22T20:56:41.279Z`; Calendly → normalizer → booking adapter, fixed pilot consultant binding.
- Certified publisher: `7643611`, inactive, transport-only, separate from V2.3 adapter email path.
- Private package compiler: `7649501`, inactive, certified for controlled tests.

## Observed runtime failures (not simply scenario status)
- `7527099` 2026-09-23: Gemini `gemini-3-flash` free-tier requests 429, limit reported as 20; 503 high demand; several HTTP 400s; 2026-09-25 Tavily plan-limit 432.
- `7533518` 2026-09-23: propagated Gemini 429/503; an earlier successful adapter run does **not** certify full delivery.
- `7525730` 2026-09-23: propagated Gemini 429; earlier successes exist but do not certify no-duplicate, multi-consultant delivery.
- `7081477` shows no recorded recent successful live booking runs.
- Quota failures cannot be assumed fixed via retries, and success of isolated V5 publication does not certify V2.3 automatic delivery.

## Remediation invariants
1. No new paid Gemini account required, no Gemini/Tavily call while using offline evidence.
2. Preserve certified PREPARE/FINALIZE and governed clarification question rules.
3. Use locked Runtime identity for delivery: `consultant_id`, `first_name`, `delivery_email`; never a fixed operator mailbox.
4. Prospect submission contains *only* the opaque opportunity ID; recipient must be recovered through server-stored private context, never from prospect-controlled webhook data.
5. Legacy envelopes without a verified owner email must **not** send an email to a fallback mailbox.
6. Secure server-only lifecycle fields must never be returned in prospect-facing clarification JSON.
7. Keep Calendly ingress gated/inactive until dry-run tests for no-question and submitted-answer paths, idempotency, and provider resilience pass.
8. Do not call the production Make implementation a migration oracle until end-to-end evidence is certified.

## Next gate
Offline server tests for ownership/delivery binding and failure cases → no-credit Make wiring readback → validate using stored executions → one budgeted provider run later only if essential and approved.
