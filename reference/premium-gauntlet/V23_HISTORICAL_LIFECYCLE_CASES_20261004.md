# V2.3 historical lifecycle cases — October 4, 2026

Purpose: historical, read-only Make execution identifiers and invariant outcomes for a future Make→Node parity corpus. **Not** a fresh production certification of current edited blueprints. No prospect-identifying payloads, invitations, email recipients, or credentials stored in this public repository.

## Historical zero-question PREPARE → FINALIZE

- Scenario `7527099`, execution `1ffc5c380e78422e8e36be1112f44e0e`, 2026-09-23, 9 Make credits.
- Make execution status success; application status `FINALIZED`, `requires_clarification=false`, `persisted=false`.
- Clarification package contains exactly **0** questions; no invite URL; final stage `FINALIZE`; final brief exists.
- Final audit: `PASS`, 0 violations, `repair_required=false`.
- FINALIZE stage output and FINAL case state matched (compared as parsed JSON).

## Historical clarification-required path

1. PREPARE: scenario `7527099`, execution `a83643259d64462bafac31c58425dbac`, 2026-09-22, 8 Make credits. Application status `READY`, requires clarification, persisted, 1 guided question, invite generated.
2. Prospect submission continuation: scenario `7525730`, execution `9e4289c24db548df966572eb93dc7128`, 2026-09-23, success, 2 Make operations. An execution success **does not by itself certify** recipient ownership, idempotency, or email content.
3. FINALIZE_SUBMITTED: scenario `7527099`, execution `177e211a74f54a5c8fc0539e4ffddd7c`, 2026-09-23, 2 Make credits. Application status `FINALIZED`, final brief present, `requires_clarification=true`, `persisted=true`.
4. The PREPARE case state for the initial and submitted executions matched *exactly* as parsed JSON; final audit `PASS`, 0 violations, `repair_required=false`. FINALIZE stage output and FINAL case state matched.

## Critical exclusions and blockers

- These executions predate October 4 delivery/website strict-gate edits; **do not** claim current blueprint E2E certification from them.
- `scenario_execution_list(status=success)` also contained entries with nonempty errors or application status `BLOCKED`. For migration evidence, require application-level status, supported audit, question-count, and final artifact—never only Make's outer status.
- Historical 2026-09-21 attempt at `gemini-2.5-flash` returned **404**, saying no longer available to new users. Other failures: `gemini-3-flash` 429 free-tier limit and 503 demand; Tavily 432 plan limit on Sep 25. Changing model aliases blindly will not solve these or preserve semantic parity.
- `7081477` Calendly ingress remains inactive, hence no live production booking certificate.
- `7525730` submission email recipient is still hardcoded in production, pending draft server private delivery binding rollout and subsequent verified Make change.
- No new Gemini or Tavily call has been executed in this readiness work.

## Safe current state / changes for next audit

- `7360890` frozen governed PREPARE/FINALIZE unchanged.
- `7533518` immediate-final consultant email and greeting now map from locked Runtime profile, with recipient-present guard. Last edit `2026-10-04T15:35:44.323Z`.
- `7527099` now transports optional consultant delivery email through START and admin-only FINALIZE returns; last edit `2026-10-04T15:35:24.591Z`. Production server currently ignores that extra field until draft code is deployed; no claim of submitted-delivery activation.
- Draft branch server `buildFinalizeContext` privately validates and persists paired consultant ID + delivery email; `buildFinalizeBundle` exposes those to authenticated admin only, with backwards-compatible null for legacy envelopes.
- `7081477` inactive ingress strict-gates `QUESTION_DOMAIN` from Company website Q&A; the normalization API has optional strict mode on draft branch, with unit tests. Last edit `2026-10-04T15:39:30.429Z`.
- `7649501` compiler and `7643611` premium publisher remain inactive.

## Freeze exit checks

1. Deploy private delivery-binding contract after branch regression/gate review, not by merging PR #6 indiscriminately.
2. Rebind `7525730` submission email to authenticated `consultant_delivery_email`; block legacy ownerless records without misdelivery. Certify notification-dedupe/retry behavior.
3. Confirm pilot Calendly event contains a **required** Company website question; test a denied missing-website request and an admitted valid answer.
4. Choose permitted, accessible provider quotas and test failure handling without auto-retry storms; do not buy API access by default.
5. Re-certify current V2.3 exact zero-question + clarification-required + submission paths, plus all negative cases; freeze/export version-locked blueprints and golden payloads privately only when green.
6. Keep Antigravity Prompt 2 paused until those freeze conditions are met.
