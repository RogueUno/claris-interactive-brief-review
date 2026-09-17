# CLARIS Calibration → Runtime V3 adapter

This directory is the firewall between the rich consultant calibration profile and the already-certified Make PREPARE / FINALIZE runtime.

## Pipeline

`Calibration snapshot → consultant_operating_profile_v1 → deterministic validator → Runtime V3 compiler → existing consultant_sot_json`

No LLM is used in this compilation path.

## Runtime-active in V3

Only these consultant-owned fields are allowed to cross the adapter boundary:

- consultant full name + firm
- selected services whose state is `ACTIVE` or `SELECTIVE`
- operating ICP company types
- minimum engagement **only when already expressed in USD**
- budget-required-before-first-call boolean
- the certified subset of first-call rules

Everything else is retained in the rich profile but omitted from Runtime V3.

## CLARIS-owned and immutable here

The adapter injects, rather than accepts from consultant input:

- unknown-is-acceptable / unknown-is-not-negative
- budget non-inference rule
- evidence authorities
- never-score-from classes
- non-observation rule
- match-score weights
- evidence-completeness weights

Unexpected fields are rejected by the runtime validator, so a profile cannot smuggle replacement scoring or evidence rules into `consultant_sot_json`.

## Currency fail-closed rule

The current Make contract is `minimum_viable_engagement_usd`. The adapter therefore **does not convert, relabel, or guess** EUR / GBP / other currencies. Non-USD profiles return `UNSUPPORTED_RUNTIME_CURRENCY:<CODE>` and no runtime SoT until an explicit deterministic conversion policy or a future certified runtime contract exists.

## Test

```bash
node calibration-v3/runtime/tests/adapter.test.mjs
```

The tests verify:

- Active / Selective services compile; Paused / No-longer services do not.
- Profile-only strategy, exception and commercial nuance cannot leak into runtime JSON.
- Unsupported first-call rules remain profile-only.
- Non-USD currency fails closed.
- Attempts to inject runtime governance fields are rejected.
- Unconfirmed critical hard-disqualifier state fails closed.
