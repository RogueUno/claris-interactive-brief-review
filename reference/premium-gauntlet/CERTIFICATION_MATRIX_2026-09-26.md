# CLARIS Premium MVP Certification Matrix — 2026-09-26

## Meaning
- CERTIFIED = executed proof exists for the stated layer.
- STRUCTURALLY GREEN = deterministic/local proof exists, but the live integration surface has not yet been exercised.
- PENDING LIVE = implementation exists but requires a live external execution.
- FROZEN = protected production surface; no premium change promoted.

## Protected production

| Surface | State | Evidence / boundary |
|---|---|---|
| 7360890 — CLARIS Lab Agentic Intelligence V3 | FROZEN / ACTIVE | Premium work does not modify frozen PREPARE/FINALIZE. Last known production checkpoint remains 2026-09-21. |
| 7527099 — Lifecycle Orchestrator V2.3 | FROZEN / ACTIVE | No premium promotion. |
| 7081477 — Calendly Production Ingress | FROZEN / INACTIVE | Must remain gated until end-to-end premium lifecycle is certified. |
| 7533518 — Production Booking Adapter | FROZEN | No private-brief publisher wiring yet. |
| 7525730 — Prospect Submission Continuation | FROZEN | Existing continuation untouched. |

## Premium intelligence

| Layer | State | Notes |
|---|---|---|
| Premium Research first-party-first | STRUCTURALLY GREEN | Resend live search-first retrieval proved domain-first evidence quality. Search-first design replaces raw crawl for premium path. |
| Evidence Curator | STRUCTURALLY GREEN | Resend compact packet reached 7/7 first-party findings and materially reduced prompt tokens. |
| Premium PREPARE V3.6 authority contract | CERTIFIED LOCALLY | Booking/prospect/explicit consultant policy may open dimensions; public research may not. |
| Discovery Intent Catalog — 15 families | CERTIFIED LOCALLY | Catalog integrity/regression checks passed. |
| Authorized Dimensions Compiler | CERTIFIED LOCALLY | PREPARE + explicit consultant policy compile deterministic writable dimensions. |
| Discovery Plan Skeleton Compiler | CERTIFIED LOCALLY | Model receives authorized question slots rather than deciding what may be asked. |
| Discovery deterministic validator | CERTIFIED LOCALLY | Rejects economics leakage, invalid services, bad branch authority and capability-as-disqualifier failures. |
| Discovery semantic model path | PENDING LIVE | Resend/Linear V1.1/V1.2 runs proved direction, but final live Make V1.2 zero-economics contract still needs rerun after Make connector recovers. |

## Golden fixtures

| Fixture | State | Shape |
|---|---|---|
| Resend — sparse API security | CERTIFIED LOCALLY | 2 dimensions / 2 primary questions. |
| Linear — enterprise security-review friction | CERTIFIED LOCALLY | 2 dimensions / 2 primary questions. |
| Supabase — richer OAuth/RLS review booking | CERTIFIED LOCALLY | 3 dimensions / 3 questions; already-known ownership/trigger suppressed. |

Local promotion harness status:
- 3/3 golden fixtures accepted.
- 6/6 adversarial mutations rejected/handled as intended.

## Private brief delivery

| Layer | State | Notes |
|---|---|---|
| Server repository/token/session model | CERTIFIED LOCALLY | Opaque tokens; SHA-256 token hash only; expiry; revocation; sessions never outlive brief. |
| Secure brief service tests | CERTIFIED LOCALLY | Earlier private-brief service suite passed locally, including revocation and fail-closed validation. |
| Deterministic delivery validator | CERTIFIED LOCALLY | Rejects uncertified schemas, unauthorized economics and invalid service mappings before persistence. |
| Consolidated /api/delivery/package gateway | PREVIEW-BUILD GREEN | Multiplexed into existing API function to remain inside Vercel Hobby 12-function cap. |
| Hobby function-cap regression | CERTIFIED BY DEPLOYMENT | Adding API function #13 failed; removing redundant /api/brief/* routes restored successful Vercel preview builds. |
| brief_publish_ready one-call operation | PREVIEW-BUILD GREEN / TESTS AUTHORED | Server preflights email, validates/persists brief, creates URL and returns CONSULTANT_BRIEF_READY package in one call. |
| Orphan-link revocation hardening | TEST AUTHORED | Unexpected post-persist notification-packaging failure revokes created brief. |
| Gateway integration suite | TESTS AUTHORED — EXECUTION PENDING | Tests cover legacy delivery, create/resolve/data/revoke, publish-ready, no-token duplication, preflight failure and revocation. GitHub app commit did not trigger Actions; local container lacks @vercel/blob/package network. |
| Browser private-link smoke test | PENDING LIVE | Vercel branch builds succeed, but current connected Vercel tool cannot expose claris-calibration deployment object/hostname for direct browser testing. |
| Consultant web brief renderer | PREVIEW-BUILD GREEN | Displays executive readout, signals, live diagnostic map, call objective/targets, answer effects, call flow, end-of-call decisions and expandable E/R/U provenance. |
| Brief-ready text email | PREVIEW-BUILD GREEN | Summary + max 3 questions + private URL; no full brief. |
| Brief-ready HTML email | PREVIEW-BUILD / TEST AUTHORED | Restrained inline HTML, plain-text fallback, escaping regression authored. |

## Make publisher

Preferred future sandbox:
StartSubscenario
→ one HTTP brief_publish_ready call
→ Gmail
→ receipt

State: PENDING LIVE.

Reason:
Make fallback connector is currently returning internal errors even for scenario_get. Alternate Make connector is not linked to the required account. No production workaround has been attempted.

When connector recovers:
1. create inactive sandbox publisher only;
2. use existing CLARIS Make authorization;
3. certify Supabase, Resend, Linear;
4. verify Gmail HTML/text output;
5. verify private link/session/revocation;
6. only then consider wiring Production Booking Adapter;
7. keep Calendly ingress inactive until full certification.

## Payment/model status

No paid Gemini dependency is required to continue architecture work.
Full Flash 3.7/3.8 previously returned provider-side 503 high-demand.
Flash-Lite is sufficient for functional architecture testing.
Model upgrade remains a quality/reliability benchmark decision after the deterministic pipeline is certified.

## Current blockers

External/integration only:
1. Make fallback connector internal error.
2. Direct preview browser smoke test blocked by Vercel connector scope for claris-calibration.
3. Gateway/new notification regression tests are committed but need execution in a clean dependency-installed environment.

No current blocker requires modifying frozen production PREPARE/FINALIZE or activating Calendly.
