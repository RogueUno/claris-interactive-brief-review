# CLARIS Real Pilot Protocol V1

Purpose: collect credible evidence for or against the four-figure MVP thesis without changing frozen production systems.

## Scope

Use one explicitly authorized consultant and one real upcoming qualified opportunity.
Production Calendly ingress remains inactive during pilot certification unless Gate H is explicitly reopened.

The pilot tests:
1. intelligence quality,
2. diagnostic-call usefulness,
3. trust/governance,
4. prep-time replacement,
5. live branching usefulness,
6. operational delivery reliability.

It does not attempt to prove long-term close-rate lift from one call.

## Before CLARIS is shown

Record:
- opportunity_id
- company
- consultant_id
- booking text / submitted prospect context
- scheduled call time
- consultant's normal manual prep estimate for a comparable call
- if possible, actual manual prep they would perform using their normal method on this opportunity, time-boxed and recorded BEFORE CLARIS exposure

Do not let the consultant inspect the CLARIS brief before the baseline is recorded.

### Baseline questions to consultant

Ask only:
- How many minutes would you normally spend preparing for this call?
- What sources would you normally check?
- What are the main things you currently believe you need to learn on the call?

Do not prime them with CLARIS findings yet.

## Generate CLARIS candidate

Run the same candidate architecture:
Research -> Premium PREPARE V3.6 -> Authorized Dimensions -> Question Skeleton -> Discovery V1.2 -> deterministic validators -> private publish-ready.

Require:
- all deterministic gates PASS;
- no material semantic-audit hard failure;
- all 15 ontology intents accounted for in skeleton coverage;
- private publication succeeds;
- consultant receives only compact notification + private brief.

Record CLARIS generation/runtime errors separately from content quality.

## Consultant pre-call review

Start timer immediately before consultant opens CLARIS.
Stop when they say they are ready for the call.

Capture:
- claris_review_minutes
- material_facts_not_in_booking
- any fact they believe is wrong or misleading
- any question they would remove before the call
- any critical question they think is missing
- whether the diagnostic map changed their intended call opening

Do not coach the consultant into liking the brief.

## During call

The consultant may use the private brief as a quiet reference.

Do not require them to follow a script.

Observe/capture after the call:
- which primary questions were actually used;
- which were materially helpful;
- which were skipped because the prospect answered them organically;
- which conditional probes were triggered;
- which triggered probe was useful;
- whether a new prospect answer correctly opened a deeper discovery family;
- whether CLARIS caused the consultant to ask an irrelevant or leading question;
- whether the consultant discovered a material issue CLARIS had failed to prepare them for.

No call recording is required for MVP acceptance unless separately consented to.

## Immediately after call

Collect before discussing pricing:

Ratings 1–5:
- trust in CLARIS facts / boundaries
- live usability
- diagnostic confidence versus normal preparation

Boolean / counts:
- would_use_next_serious_call
- primary_questions_total
- primary_questions_helpful
- redundant_questions_avoided
- conditional_probes_triggered
- conditional_probes_helpful
- material_wrong_fact_count
- unsupported_inference_changed_call
- missed_critical_question_changed_call
- private_data_exposure
- consultant_policy_violation

Manual-prep replacement:
- NONE
- PARTIAL
- MOSTLY
- FULL

Open text:
- strongest_value
- missing_or_weak
- consultant_quote
- call_outcome

## Deterministic evaluation

Run evaluatePilotV1.

Hard trust failures:
- material wrong fact;
- unsupported inference changed the call;
- missed critical diagnosis changed the call;
- private-data exposure;
- consultant-policy violation.

Any hard trust failure blocks paid-pilot readiness until investigated.

Internal paid-pilot candidate gate currently expects:
- no hard failures;
- consultant would use CLARIS on the next serious call;
- trust >= 4/5;
- live usability >= 4/5;
- >= 70% primary questions materially helpful;
- >= 20 minutes net prep time saved;
- >= 2 material useful facts not already in the booking.

Four-figure value evidence strong additionally expects:
- CLARIS replaces MOSTLY or FULL normal manual prep;
- at least six positive value signals in the evaluator.

These thresholds are internal product gates, not evidence that the market will pay a particular price.

## Second and third real opportunities

Do not alter the ontology or scoring after one call merely to make the first result pass.

Run at least three real opportunities.

After each:
- preserve the generated artifact/version;
- preserve evaluator input/output;
- classify any failure as research / PREPARE / discovery selection / question tailoring / delivery / consultant calibration.

After three:
- aggregate time saved;
- aggregate question helpfulness;
- count material factual errors;
- count useful conditional branches;
- record reuse intent;
- compare the consultant's normal prep workflow with CLARIS.

## Four-figure MVP decision

Do not decide based on one impressive brief.

Evidence becomes commercially meaningful when:
- at least 2 of 3 real opportunities satisfy paid-pilot candidate gate;
- zero opportunity has a material trust/governance failure;
- consultant chooses to use CLARIS again without prompting;
- consultant can name concrete prep/call behavior CLARIS improved;
- CLARIS measurably replaces a meaningful portion of normal prep.

Only then use pricing conversations to test whether the implementation/service is worth four figures to real buyers.