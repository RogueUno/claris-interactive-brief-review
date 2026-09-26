# CLARIS Four-Figure MVP Promotion Gate V1

Purpose: prevent a promising sandbox from being mistaken for a production-ready consultant product.

## Gate A — Consultant intelligence

PASS requires:
- Calibration identity is canonical and server-bound.
- consultant_operating_profile_v1 validates.
- Runtime V3 compiler is deterministic.
- profile-only strategy cannot leak into Runtime V3.
- consultant policy can explicitly open required discovery dimensions.
- unsupported currency/runtime states fail closed.

Current status: PASS on existing Calibration/Runtime test suite. Frozen production behavior remains untouched.

## Gate B — Premium research

PASS requires:
- first-party-first research;
- authoritative source preference;
- no public capability -> prospect intent leap;
- no vulnerability/urgency/budget/buyer inference;
- compact curated evidence packet;
- retrieval cost within pilot bounds.

Current status: DESIGN/GOLD PASS; live Make V3.2 search-first integration still sandbox-only.

## Gate C — Premium PREPARE V3.6

PASS requires:
- every open dimension has BOOKING, PROSPECT, or CONSULTANT_POLICY authority;
- public research never opens a dimension;
- dense main brief;
- expandable E/R/U provenance;
- deterministic validator passes;
- no generic discovery leakage.

Golden fixtures:
- Resend: PASS
- Linear: PASS
- Supabase: PASS

Current status: GOLD + deterministic certification PASS. Live model path requires final Make certification.

## Gate D — Discovery Intelligence V1.2

PASS requires:
- authorized-dimensions compiler runs before LLM tailoring;
- question-plan skeleton limits writable slots;
- 15-family ontology is complete but suppressed by default;
- primary questions resolve only authorized dimensions;
- listen-fors are concrete;
- conditional probes are earned by prospect answers;
- service paths remain conditional;
- economics is absent unless explicitly authorized;
- capability domains cannot become disqualifiers;
- deterministic validator passes after semantic generation.

Golden shapes:
- Resend: 2 dimensions / 2 primary questions
- Linear: 2 dimensions / 2 primary questions
- Supabase: 3 dimensions / 3 primary questions

Current status: GOLD + deterministic certification PASS. Live Make Discovery engine still pending connector recovery.

## Gate E — Secure private brief delivery

PASS requires:
- opaque fragment token;
- raw token never stored;
- token resolves to HttpOnly + Secure + SameSite=Strict session;
- session never outlives brief;
- revocation invalidates existing sessions;
- delivery validator reruns before persistence;
- legacy delivery remains compatible;
- all three gold fixtures publish/resolve/load;
- browser client syntax passes;
- no extra Vercel serverless functions beyond Hobby cap.

Current status: PASS in GitHub Actions.
Vercel function footprint: 12 / 12.
Preview protection remains enabled.

## Gate F — Retry/idempotency

PASS requires:
- same opportunity + same certified artifact => same publication_id + private URL;
- presentation-context-only changes update existing private brief;
- changed certified intelligence => new publication;
- revoked publication cannot be resurrected;
- stable notification_dedupe_key returned to Make;
- raw token never stored.

Current status: PASS in branch tests.

## Gate G — Make publisher

PASS requires:
- one sandbox scenario consumes only certified PREPARE + Discovery + minimized consultant policy;
- one POST to /api/delivery/package with X-Claris-Delivery: brief_publish_ready;
- Gmail content maps only server-returned delivery package;
- notification_dedupe_key checked before send;
- delivery receipt persisted only after Gmail success;
- retry of identical publication does not duplicate email in normal retry path;
- no fallback to old CONSULTANT_FINAL when premium publication fails.

Current status: PENDING — exact BLUEPRINT + machine-readable contract committed; Make connector currently failing internally.

## Gate H — Real end-to-end pilot

PASS requires one real or explicitly authorized pilot booking:
Calendly -> normalize -> research -> Premium PREPARE -> Discovery -> validators -> private publish -> consultant email -> secure brief.

Acceptance:
- 5-minute-or-less useful prep;
- consultant learns material facts not supplied in booking;
- obvious questions are suppressed;
- remaining questions are precise and natural;
- listen-fors improve live follow-up quality;
- evidence drawers support trust without clutter;
- no fabricated intent/problem/urgency;
- consultant would choose CLARIS over manual prep for the next serious call.

Current status: PENDING.

## Gate I — Commercial readiness

Before charging four figures:
- one real consultant completes onboarding/calibration;
- three real opportunities are prepared;
- consultant rates at least two briefs materially better than their normal prep;
- at least one call demonstrates useful answer-triggered branching;
- prep-time saved is measured;
- operational cost/reliability is recorded;
- model/provider quotas are production-capable.

Current status: PENDING.

## Production promotion rule

Do NOT activate Calendly production ingress or replace frozen PREPARE/FINALIZE until Gates C–H are green on the same candidate architecture.

Current biggest blockers:
1. Make connector availability;
2. live V3.6 + Discovery V1.2 model certification;
3. Make Publisher V1 scenario;
4. real end-to-end pilot;
5. Vercel free deployment quota reset for another preview deployment if needed.
