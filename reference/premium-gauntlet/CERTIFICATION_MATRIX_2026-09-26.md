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
| Premium PREPARE V3.6 authority contract | CERTIFIED + VERSIONED | Booking/prospect/explicit consultant policy may open dimensions; public research may not. Portable V3.6 regression test is versioned. |
| Discovery Intent Catalog — 15 families | CERTIFIED + VERSIONED | Machine-readable 15-intent catalog and human-readable ontology contract are versioned on the premium branch. |
| Authorized Dimensions Compiler | CERTIFIED + VERSIONED | PREPARE + explicit consultant policy compile deterministic writable dimensions. Compiler + portable regression test are versioned. |
| Discovery Plan Skeleton Compiler | CERTIFIED + VERSIONED | Model receives authorized question slots rather than deciding what may be asked. Compiler + portable regression test are versioned. |
| Discovery deterministic validator | CERTIFIED + VERSIONED | Rejects economics leakage, invalid services, bad branch authority and capability-as-disqualifier failures. Validator + regression test are versioned. |
| Discovery semantic model path | PENDING LIVE | Resend/Linear V1.1/V1.2 runs proved direction, but final live Make V1.2 zero-economics contract still needs rerun after Make connector recovers. |

## Golden fixtures

| Fixture | State | Shape |
|---|---|---|
| Resend — sparse API security | CERTIFIED + VERSIONED + PUBLISHABLE | V3.6 + Discovery V1.2 fixture; 2 dimensions / 2 questions; passes shared validator/compiler gate and full secure gateway publish→resolve→session→load regression. |
| Linear — enterprise security-review friction | CERTIFIED + VERSIONED + PUBLISHABLE | V3.6 + Discovery V1.2 fixture; 2 dimensions / 2 questions; passes shared validator/compiler gate and full secure gateway publish→resolve→session→load regression. |
| Supabase — richer OAuth/RLS review booking | CERTIFIED + VERSIONED + PUBLISHABLE | Complete booking/SOT/source/PREPARE/Discovery/skeleton fixture; 3 dimensions / 3 questions; passes shared validator/compiler gate and full secure gateway publish→resolve→session→load regression. |

Executable promotion status:
- 3/3 golden fixtures pass one shared Premium V3.6 + Discovery V1.2 + publish-ready compiler gate.
- 3/3 golden fixtures pass the consolidated secure gateway publish → resolve → session → data load path.
- 6/6 adversarial mutations rejected/handled as intended.

## Private brief delivery

| Layer | State | Notes |
|---|---|---|
| Server repository/token/session model | CERTIFIED | Opaque tokens; SHA-256 token hash only; expiry; revocation; sessions never outlive brief. |
| Secure brief service tests | CERTIFIED — GITHUB ACTIONS | Current explicit Node 22 brief suite passes 39/39. |
| Deterministic delivery validator | CERTIFIED — GITHUB ACTIONS | Rejects uncertified schemas, unauthorized economics and invalid service mappings before persistence. |
| Consolidated /api/delivery/package gateway | PREVIEW-BUILD GREEN | Multiplexed into existing API function to remain inside Vercel Hobby 12-function cap. |
| Hobby function-cap regression | CERTIFIED BY DEPLOYMENT | Adding API function #13 failed; removing redundant /api/brief/* routes restored successful Vercel preview builds. |
| brief_publish_ready one-call operation | CERTIFIED — GITHUB ACTIONS + VERCEL BUILD | Server preflights email, validates/persists brief, creates URL and returns CONSULTANT_BRIEF_READY package in one call. |
| Orphan-link revocation hardening | CERTIFIED — GITHUB ACTIONS | Unexpected post-persist notification-packaging failure revokes the created brief; regression passes. |
| Gateway integration suite | CERTIFIED — GITHUB ACTIONS | Explicit `npm run test:brief` completed 39/39 on branch head `9922fd59559ad3515bd2b0e901c2d6b9ae770bd9`, including create→resolve→session→data→revoke, publish-ready, idempotent reuse, notification preflight, orphan-link revocation, economics leakage rejection, invalid-service rejection, and Resend/Linear/Supabase publication paths. |
| Browser private-link smoke test | DEPLOYMENT PROTECTED / APP TEST PENDING | App-level browser verification still requires access to the protected `claris-calibration` preview. Current connected Vercel account does not expose that project. This is an access limitation, not a failed CLARIS route. |
| Consultant web brief renderer | PREVIEW-BUILD GREEN | Displays executive readout, signals, live diagnostic map, call objective/targets, answer effects, call flow, end-of-call decisions and expandable E/R/U provenance. |
| Brief-ready text email | PREVIEW-BUILD GREEN | Summary + max 3 questions + private URL; no full brief. |
| Brief-ready HTML email | CERTIFIED CONTRACT / PREVIEW-BUILD GREEN | Restrained inline HTML, plain-text fallback and compact question list are covered by delivery integration tests; visual email-client verification remains later. |

## Make publisher

Preferred future sandbox:
StartSubscenario
→ one HTTP brief_publish_ready call
→ Gmail
→ receipt

State: PENDING LIVE.

Reason:
A fresh read-only Make fallback environment probe on 2026-09-27 still returned an internal connector error. Per operating rules, no repeated retries or alternate-account workaround was attempted.

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
2. Live V3.6 + Discovery V1.2 model/runtime certification in Make.
3. Make Publisher V1 live scenario execution.
4. Protected Vercel preview prevents direct app-level browser smoke with the currently connected Vercel account.
5. Real end-to-end consultant pilot.

No current blocker requires modifying frozen production PREPARE/FINALIZE or activating Calendly.

## Repository reproducibility update

The premium branch contains the deterministic core:
- authorized-dimensions-compiler.mjs + test
- discovery-plan-skeleton-compiler.mjs + test
- discovery-validator-v12.mjs + test
- premium-prepare-validator-v36.mjs + portable V3.6 test
- discovery-intents-v1.json
- discovery-intelligence-v1.2.md
- discovery-ontology-v1.md
- complete Supabase fixture: booking, consultant SOT, source manifest, Premium PREPARE gold, Discovery V1.2 gold, Discovery skeleton

package.json exposes:
- `npm run test:premium`
- `npm run test:brief`

Latest same-head CI evidence:
- `npm run test:premium`: PASS
- `npm run test:brief`: 39/39 PASS
- broader branch server suite: no new failures versus main baseline
- GitHub Actions run 203: SUCCESS
- matching Vercel preview build on `9922fd59559ad3515bd2b0e901c2d6b9ae770bd9`: SUCCESS
- API function footprint remains 12

The remaining critical gap is live Make model/publisher execution and then real-pilot evidence, not server-side publication architecture.
