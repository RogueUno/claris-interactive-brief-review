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
| Premium PREPARE V3.6 authority contract | CERTIFIED — LIVE SANDBOX 3/3 | Supabase, Resend and Linear now pass semantic + deterministic V3.6 gates in Make. Live sandbox adds real JSON syntax gates, structured Gemini output, deterministic provenance normalization, and bounded markdown-only repair. |
| Discovery Intent Catalog — 15 families | CERTIFIED + VERSIONED | Machine-readable 15-intent catalog and human-readable ontology contract are versioned on the premium branch. |
| Authorized Dimensions Compiler | CERTIFIED + VERSIONED | PREPARE + explicit consultant policy compile deterministic writable dimensions. Compiler + portable regression test are versioned. |
| Discovery Plan Skeleton Compiler | CERTIFIED + VERSIONED | Model receives authorized question slots rather than deciding what may be asked. Compiler + portable regression test are versioned. |
| Discovery deterministic validator | CERTIFIED + VERSIONED | Rejects economics leakage, invalid services, bad branch authority and capability-as-disqualifier failures. Validator + regression test are versioned. |
| Discovery semantic model path | CERTIFIED — LIVE SANDBOX 3/3 | Supabase, Resend and Linear all pass semantic + deterministic Discovery V1.2 gates. Linear final revalidation passed unchanged after mirroring the versioned plural-questionnaire branch rule into Make. |

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
| Secure brief service tests | CERTIFIED — GITHUB ACTIONS | Current explicit Node 22 brief suite passes 40/40. |
| Deterministic delivery validator | CERTIFIED — GITHUB ACTIONS | Rejects uncertified schemas, unauthorized economics and invalid service mappings before persistence. |
| Consolidated /api/delivery/package gateway | PREVIEW-BUILD GREEN | Multiplexed into existing API function to remain inside Vercel Hobby 12-function cap. |
| Hobby function-cap regression | CERTIFIED BY DEPLOYMENT | Adding API function #13 failed; removing redundant /api/brief/* routes restored successful Vercel preview builds. |
| brief_publish_ready one-call operation | CERTIFIED — GITHUB ACTIONS + VERCEL BUILD | Server preflights email, validates/persists brief, creates URL and returns CONSULTANT_BRIEF_READY package in one call. |
| Orphan-link revocation hardening | CERTIFIED — GITHUB ACTIONS | Unexpected post-persist notification-packaging failure revokes the created brief; regression passes. |
| Gateway integration suite | CERTIFIED — GITHUB ACTIONS | Explicit `npm run test:brief` completed 40/40 on branch head `32b332535fb565f74b00de66db1f1b53ee6875d9`, including create→resolve→session→data→revoke, publish-ready, idempotent reuse, notification preflight, orphan-link revocation, economics leakage rejection, invalid-service rejection, and Resend/Linear/Supabase publication paths. |
| Browser private-link smoke test | PARTIAL — ROUTE GREEN / JS SESSION PENDING | Authenticated Vercel fetch of `/brief-v1/` returns 200 with no-store, noindex, frame denial, strict CSP and the expected secure gate shell. Local Chromium cannot complete fragment-token/session rendering because outbound preview navigation is blocked by the execution environment, not by CLARIS. |
| Consultant web brief renderer | PREVIEW-BUILD GREEN | Displays executive readout, signals, live diagnostic map, call objective/targets, answer effects, call flow, end-of-call decisions and expandable E/R/U provenance. |
| Brief-ready text email | PREVIEW-BUILD GREEN | Summary + max 3 questions + private URL; no full brief. |
| Brief-ready HTML email | CERTIFIED CONTRACT / PREVIEW-BUILD GREEN | Restrained inline HTML, plain-text fallback and compact question list are covered by delivery integration tests; visual email-client verification remains later. |

## Live PREPARE / Discovery model-runtime certification

Sandboxes:
- 7622556 — CLARIS Lab — Premium PREPARE V3.6 Authority-Gated Sandbox
- 7644561 — CLARIS Lab — Premium PREPARE Deterministic Validator V3.6
- 7629321 — CLARIS Lab — Discovery Intelligence Engine V1.2
- 7629432 — CLARIS Lab — Discovery Deterministic Validator V1

All remain inactive outside controlled certification runs.

PREPARE V3.6 hardening now in Make:
- planner structured JSON output schema;
- real JSON parse gate after planner;
- deterministic provenance normalizer that only removes dangling routes and clears non-policy policy_key values;
- bounded markdown-only repair stage;
- mutation guard proving the repair cannot alter any intelligence field;
- semantic audit;
- real JSON parse gate after audit;
- separate deterministic validator mirrored from the versioned V3.6 validator.

Live PREPARE results:
- Supabase: semantic PASS + deterministic PASS.
- Resend: semantic 18/18 PASS + deterministic PASS.
- Linear: semantic 18/18 PASS + deterministic PASS, 478-word brief.

Discovery V1.2 hardening:
- real JSON parse gates for planner and auditor;
- temperature=0;
- commercial_target must be exactly [] when economics is unauthorized;
- earned branch authority tightened;
- capability-safe disqualification wording.

Live Discovery results:
- Supabase: semantic 20/20 PASS + deterministic PASS.
- Resend: semantic 20/20 PASS + deterministic PASS.
- Linear: semantic 20/20 PASS + deterministic PASS after correcting Make validator drift for plural security questionnaires. The unchanged Linear Discovery artifact revalidated with zero errors.

## Make publisher

Live sandbox:
StartSubscenario
→ authenticated brief_publish_ready HTTP
→ dedicated notification dedupe store
→ Gmail using server-authored package only
→ SENT marker
→ minimal ReturnData receipt

State: CERTIFIED — LIVE SANDBOX.

Live Make artifacts:
- Publisher scenario: 7643611 — CLARIS Lab — Premium Brief Publisher V1
- Receipt store: 199489 — CLARIS Premium Brief Delivery Receipts V1
- Revoke certifier: 7644247 — CLARIS TEST — Premium Brief Revoke Certifier
- Both scenarios are inactive after certification.
- Execution history is confidential for the publisher.
- Vercel Deployment Protection stays enabled; Make uses Vercel Protection Bypass for Automation.

Executed live evidence on 2026-09-27:
1. Supabase gold → DELIVERED, first publication.
2. Identical Supabase retry → reused=true + SKIPPED_DUPLICATE; no second Gmail.
3. Supabase presentation-only meeting-time change → same publication + SKIPPED_DUPLICATE.
4. Missing certification envelope → HTTP 422 before Gmail.
5. Unauthorized economics target → HTTP 422 before Gmail.
6. Resend gold → DELIVERED.
7. Linear gold → DELIVERED.
8. Supabase publication revoked through authenticated gateway.
9. Retry after revocation → HTTP 410 Gone before Gmail.

Publisher authority boundary:
- Make accepts one upstream-certified minimized publish_ready_body_json.
- Make does not reconstruct PREPARE/Discovery, consultant policy, or certification.
- Full consultant SOT is not accepted.
- Private brief URL/token is not persisted in the Make receipt store.
- notification_dedupe_key is written only after Gmail succeeds.

Production Booking Adapter and Calendly ingress remain untouched/unwired.

## Payment/model status

No paid Gemini dependency is required to continue architecture work.
Full Flash 3.7/3.8 previously returned provider-side 503 high-demand.
Flash-Lite is sufficient for functional architecture testing.
Model upgrade remains a quality/reliability benchmark decision after the deterministic pipeline is certified.

## Current blockers

Remaining:
1. Interactive private-link browser smoke.
2. Real end-to-end consultant pilot.
3. Production promotion decision only after those gates are green.

Make Publisher V1 itself is no longer a blocker.
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
- `npm run test:brief`: 40/40 PASS
- broader branch server suite: no new failures versus main baseline
- GitHub Actions run 203: SUCCESS
- matching Vercel preview build on `9922fd59559ad3515bd2b0e901c2d6b9ae770bd9`: SUCCESS
- API function footprint remains 12

Live PREPARE and Discovery model-runtime certification is complete across Supabase, Resend and Linear. The critical path is now interactive brief smoke and a real pilot.
