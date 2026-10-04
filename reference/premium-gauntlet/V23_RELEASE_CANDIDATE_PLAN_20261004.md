# CLARIS V2.3 → safe production rollout (pre-freeze)

Date: 2026-10-04. **Not authorization to activate Make or send emails.** This checklist describes candidate changes, historical evidence, and unresolved gates. It is NOT the final Make freeze required before Antigravity migration Prompt 2.

## Release branches

| Scope | GitHub PR | Base | Purpose | Current state |
|---|---|---|---|---|
| Secure owner and submitted clarification | [#7](https://github.com/RogueUno/claris-interactive-brief-review/pull/7) | `main` | Locks consultant identity, validates stored SOT, protects submitted-final email reservation/ACK | Draft, unmerged, owner CI green |
| Immediate-final zero-question safety | [#8](https://github.com/RogueUno/claris-interactive-brief-review/pull/8) | PR #7 branch | Register booking BEFORE Gemini; permit one certified-final send attempt with ACK | Stacked draft, unmerged, direct-final CI green |
| V5 presentation + publication + broader lifecycle code | [#6](https://github.com/RogueUno/claris-interactive-brief-review/pull/6) | `main` | V5 UI, published private brief, company snapshot and V5 outbox | Large draft, **do not merge with security fixes in one deployment** |

## Promotion sequence (not yet executed)

1. Inspect PR #7 relative to production `main`: 10 changed files and owner-safety regression tests. Confirm no pending clarification envelopes require legacy-owner reconciliation before merging. Stage production backout point and verify the GET locked-runtime response still matches current V2.3 Make mappings.
2. Promote PR #7 alone when a safe deployment window is approved. Verify authenticated admin package operation using no-send synthetic data. Ensure existing legacy invitations remain readable; a missing verified owner must produce **no consultant email**, not an operator fallback.
3. Rebase/retarget PR #8 onto updated `main` **after** PR #7 promotion. Preserve its isolated seven-file scope. Its server outbox registers deterministic Calendly opportunities before PREPARE and claims only `status=FINALIZED`, `final_stage=FINALIZE`, `requires_clarification=false` and audit PASS/no violations/no repair. Verify private Blob create-only/CAS semantics in deployed Vercel against no-send test opportunities.
4. Only after each server contract is deployed: checkpoint original Make blueprints for `7525730` and `7533518`; replace hard-coded final recipient, add preflight/claim/send/ACK gates. Stop and reconcile all 409/422/timeouts without retry loops. Keep existing Gmail IDs and legacy receipt stores.
5. Keep Calendly ingress `7081477` **inactive** while testing. Historical 2026-09-23 zero-question and submitted-clarification runs were successful but **predate** new outbox/website gates, so they are parity examples, not current production certification.
6. In V5 publisher `7643611` (inactive), preserve the old Data Store receipt (ID 199489), then use the draft `brief_notification_claim` + `brief_notification_ack` API. Do not send before claim or claim twice when previous receipt exists. The separate V5 UI PR #6 should be reviewed/rebased after #7/#8 have settled.
7. Certify all paths with one bounded and explicitly budgeted Gemini/Tavily run only when providers are available; test quota 429/432, unknown Gmail outcome, expired/invalid links, wrong consultant, retry, and concurrent booking. Do not activate live Calendly or declare paid-client readiness until current runs and logs verify success.
8. Freeze/export exact Make blueprints, prompts, contracts, executions, provider versions and golden payloads **privately**. Then and only then start Antigravity migration Prompt 2 against the frozen behavioral oracle.

## Important details

- The locked consultant greeting comes from `2.data.runtime_v3.consultant_sot_json.consultant.consultant_name`. The V2.3 result does **not** declare `consultant_first_name` in its outputs.
- Historical zero-question V2.3 execution `1ffc5c380e78422e8e36be1112f44e0e` returned `FINALIZED` + `FINALIZE` + `requires_clarification=false`, a PASS final audit with zero violations and `repair_required=false`; final brief existed. This is a historical contract check, not a live execution of the new code.
- Current no-question Booking Adapter `7533518` is active/on-demand and still has **unguarded Gmail module 7**; direct-final PR #8 does not secure that live module until Make wiring changes. The `7525730` submitted continuation is also active with its old email recipient. Do not invoke either for sales certification yet.
- Current frozen governed PREPARE/FINALIZE `7360890` remains unmodified. V5 publisher `7643611` and Calendly ingress `7081477` remain inactive.
- The direct-final approach intentionally fails closed even after Gemini 429 or a lost registration response: an unresolved REGISTERED receipt needs operator reconciliation. No automatic restart/clear action is currently deployed.
- All new tests are synthetic/in-memory or branch build tests. They do not prove real Gmail delivery, Vercel Blob contention or current provider availability.
- **Expenditure for October 4 reliability engineering:** zero new Make execution credits, zero Gemini requests, zero Tavily requests, zero Gmail sends.