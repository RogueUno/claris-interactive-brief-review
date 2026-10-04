# V2.3 no-provider pre-freeze handoff — 2026-10-04

**Status: candidate / NOT the certified Make freeze.** These notes are deliberately sanitized: no contact addresses, API credentials, webhook URLs, private brief tokens, personal payloads, or Make connection secrets. The Node/Antigravity Prompt 2 migration **must remain paused**.

## Verified Make scenario topology (read-only after writes)

| Scenario | Modules | Status | Last edit (UTC) | Boundary |
| --- | ---: | --- | --- | --- |
| 7360890 | 77 | active, 0 incomplete | 2026-10-01T21:43:42.969Z | Frozen governed PREPARE/FINALIZE — not edited during this pass |
| 7527099 | 55 | active, 0 incomplete | 2026-10-04T15:45:56.169Z | Lifecycle V2.3 protocol, normal and repaired |
| 7533518 | 7 | active, 0 incomplete | 2026-10-04T15:35:44.323Z | Locked Runtime → V2.3 booking delivery |
| 7525730 | 3 | active, 0 incomplete | 2026-09-22T18:55:42.269Z | Submitted prospect continuation; old fixed recipient still present |
| 7081477 | 5 | **inactive**, 0 incomplete | 2026-10-04T15:39:30.429Z | Calendly → normalized booking → adapter, company-website gate |
| 7649501 | 3 | inactive, 0 incomplete | 2026-09-27T21:34:54.389Z | Separate V5 certified package compiler |
| 7643611 | 8 | inactive, 0 incomplete | 2026-10-01T21:46:35.120Z | Separate private V5 publisher with notification receipt |

No Make scenarios were executed or activated in the October 4 structural pass. No Gemini, Tavily, or Gmail calls were made.

## Secure ownership propagation: now mapped in Make

1. `7533518` resolves a LOCKED/READY consultant profile and its delivery identity from the authenticated Runtime V3 endpoint. Consultant first name derives from the locked profile; immediate FINAL email is mapped to that profile's recipient with an existence gate, not an operator literal.
2. `7533518` sends `consultant_delivery_email` into `7527099`.
3. `7527099` now carries the field in protocol payload modules **13, 16, 20, 25, 30, 34, 39**, including *every* verification/repair persistence path. Before the October 4 fix, only START carried it, and persistence dropped it.
4. The submitted-finalize normal and retry returns **53, 79** recover recipient from authenticated `FINALIZE_BUNDLE` response.
5. **Production server has not been updated** to persist/verify/return recipient yet; do not point the active prospect email to this currently empty value.

### Isolated server candidate and tests

Branch: `v23-delivery-owner-gate-20261004` (based on `main`), **not merged**.

- `clarification-v1/server/finalize-handoff.mjs`: persist private `consultant_id` + `consultant_delivery_email`; compare private owner to immutable clarification package; keep legacy ownerless envelopes readable and email-less.
- `clarification-v1/server/verify-locked-delivery-owner.mjs`: verify consultant ID, registered email, locked READY profile, and canonicalized consultant SOT against the current profile before new clarification persistence; no Make-provided recipient can override server identity.
- `api/clarification/admin/package.mjs`: invoke identity verification only upon approved clarification persistence; return failures without exposing recipient or secrets; admin-only FINALIZE outputs may include verified owner email, never prospect-facing payloads.
- Tests: wrong consultant, invalid recipient, changed SOT, blocked/unlocked profile, malformed input, private-owner mismatch, prospect-view non-leakage, ownerless legacy fail-closed, offline prospect submission → final email package, duplicate-submission rejection.
- GitHub Actions `V2.3 Delivery Ownership Safety`: targeted tests and comparison with main's known preexisting baseline failures **passed**. Vercel feature-branch deployment READY. No real email/provider invocation.
- Same server guard and offline tests also staged on **draft PR #6** (unmerged); PR #6 additionally has strict Calendly website tests.

## Calendly production gate

Connected Calendly `30 Minute Meeting` has `Company website` question **enabled and required**. Inactive Make ingress `7081477` additionally requires `QUESTION_DOMAIN`; draft API optionally enables strict mode and rejects inference from free/business email and unrelated text. Draft parser excludes website fields from company-name matching, derives from registrable-label approximation, and rejects obvious local/IP/reserved targets. Do not rely on this as a full DNS-level anti-SSRF guarantee.

## Historical provider-free parity evidence

Read `V23_HISTORICAL_LIFECYCLE_CASES_20261004.md` and `V23_OCT2026_READINESS_CHECKPOINT.md` in the same folder. Historical zero-question and clarification/submission paths have application-level `FINALIZED`, audited `PASS`, zero violations and matching frozen PREPARE state across answer submission. These runs predate the ownership corrections and do **not** certify current end-to-end orchestration.

## Next no-credit actions / production gates

- Verify and integrate isolated server patch into production **without merging unrelated PR #6 content**; keep GitHub/Vercel deployment checkpoints and regression checks.
- Only after production endpoint returns authenticated nonempty owner, rebind `7525730` Gmail recipient from the FINALIZE output, with fail-closed guard for old invitations and an idempotent delivery receipt before enabling it for paying clients.
- Verify no PII leaks to prospect page and zero-question path uses current Runtime owner.
- Resolve known Gemini 429/free-tier and Tavily 432 limits without flooding retries. One bounded provider-backed run per current path is still required for production freeze; **not executed in this pass**.
- Maintain inactive Calendly ingress until both paths and no-send/duplicate tests are certified. Do not run Antigravity migration Prompt 2 yet.


## Historical Gemini and Make budget baseline (no calls made today)

From one historical successful **zero-question** execution on 2026-09-23 (execution IDs remain in Make, not raw payloads in this repository):

| Exact historical component | Gemini node invocations | Make credits |
| --- | ---: | ---: |
| Frozen PREPARE `9262ebe0f0e747af84a15ad4d5edaf2c` | 6 (1 Flash, 5 Flash-Lite) | 21.61 |
| V2.3 clarification decision `1ffc5c380e78422e8e36be1112f44e0e` | 2 (1 Flash, 1 Flash-Lite) | 9 |
| Frozen FINALIZE `4fbb46b4af3545938d11e7ea4fecf91b` | 5 (1 Flash, 4 Flash-Lite) | 30 |
| Booking adapter `b2115a0c93d74b87aa460eb2ccacafe0` | 0 direct | 2 |
| **Sum (historical nested execution only)** | **13 total** | **62.61** |

These are observed, not a guaranteed per-lead price: actual branching and repairs change the number of calls, and individual Make credit accounting includes fractional usage.

**Official provider constraint (2026-09-02 rate-limit docs):** Google evaluates RPM/TPM/RPD limits per Google Cloud project, not per API key; RPD resets at midnight Pacific time, and preview models may have stricter limits. API key rotation within a project does not create independent headroom. Source: https://ai.google.dev/gemini-api/docs/rate-limits .

**Model availability:** Google's published June 1, 2026 changelog says Gemini 2.0 Flash/Flash-Lite are shut down; 3.1 Flash-Lite is the stable low-latency model. Historical attempted 2.5 Flash returned 404 for new users; do **not** blindly downgrade certified modules or buy a subscription until the remaining integration checks pass. Sources: https://ai.google.dev/gemini-api/docs/changelog and https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite .

**Proposed no-speculative-traffic policy:** Treat Gemini 429 as quota/admission failure, not an instruction to retry whole frozen research loops immediately; Tavily 432 plan limit as no-auto-retry; Gemini 404 model unavailable as configuration failure; Gemini 503 demand as transient but eligible only for a strictly bounded, credited retry after determining whether request state was persisted. This is *policy only*, not yet deployed to Make or the frozen logic.
