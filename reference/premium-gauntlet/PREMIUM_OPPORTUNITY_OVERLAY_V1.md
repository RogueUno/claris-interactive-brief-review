# CLARIS Premium Opportunity Overlay V1

## Status
Sandbox design. Not production-active.

## Purpose
Add premium consultant leverage to CLARIS without weakening the certified evidence firewall.

The core problem identified by Premium Gauntlet #1 is not that governed PREPARE is too strict. It is that strict canonical truth is being asked to carry both:
1. factual/scoreable opportunity truth, and
2. exploratory consultant strategy.

Those are different epistemic jobs and must remain separate.

## Architecture

### Lane A — Canonical / scoreable truth
Authority:
- BOOKING_TEXT
- PROSPECT_REPORTED
- CONSULTANT_SOT for consultant policy/capability only
- admitted VERIFIED_PUBLIC_FACT / bounded corroborated evidence

Allowed uses:
- deterministic match/coverage/completeness metrics
- qualification state
- confirmed service relevance
- persisted canonical opportunity state
- prospect-facing clarification decisions

Forbidden:
- hypotheses
- inferred causes
- inferred vulnerabilities
- inferred urgency/budget/authority
- speculative service need

### Lane B — Consultant strategy overlay
Authority posture:
- may read Lane A
- may read first-party public context
- may create explicitly labelled hypotheses
- may read consultant service catalog

Allowed outputs:
- working hypotheses
- falsification conditions
- consultant-only call strategy
- prioritized discovery questions
- conditional service paths
- "if confirmed, then..." commercial implications

Forbidden:
- writing back into canonical truth
- affecting deterministic scores
- converting public context into prospect intent
- presenting hypotheses as facts
- qualifying/disqualifying by hypothesis
- auto-selecting a service from public evidence alone

## Required object boundaries

### verified_company_context[]
Each item must contain:
- fact
- source_url
- why_it_matters_for_preparation

This section contains facts only.

### opportunity_hypotheses[]
Each hypothesis must contain:
- hypothesis
- confidence = LOW | MEDIUM
- public_basis_urls[]
- why_it_is_worth_testing
- verification_question
- falsified_if

Hypotheses are consultant-only and non-scoreable.

### conditional_service_paths[]
Each path must contain:
- service_id from consultant SOT
- condition_to_confirm
- why_relevant_if_confirmed
- do_not_assume

A service path is not a recommendation until its condition is prospect-confirmed.

## Premium acceptance gate
A premium PREPARE artifact must:
- surface >=5 meaningful first-party findings where public evidence supports them;
- remain grounded;
- create incremental intelligence beyond booking/homepage;
- produce falsifiable hypotheses rather than hidden inference;
- provide company-specific call strategy;
- remain consultant-specific;
- avoid generic filler;
- fit a ~5-minute pre-call read.

Hard-fail on:
- invented vulnerability;
- invented urgency;
- invented budget;
- invented buyer authority;
- invented cause of booking;
- public context converted into confirmed need;
- confirmed service mapping without prospect/booking support;
- no fact/hypothesis/unknown separation.

## Promotion rule
No Premium Overlay implementation may replace or modify the frozen PREPARE / FINALIZE contracts until:
1. the Resend golden fixture passes,
2. at least one second real-company fixture passes,
3. a regression test demonstrates no hypothesis can reach deterministic scoring,
4. a human review finds the brief materially useful for a real consultant.

## Node migration implication
The future Node runtime should implement Lane A and Lane B as separate typed objects/modules. Do not merge them into one prompt/output object and rely on prose instructions for separation.
