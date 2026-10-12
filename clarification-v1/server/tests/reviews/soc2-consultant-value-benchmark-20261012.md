# CLARIS — SOC 2 consultant-value benchmark, offline candidate (12 October 2026)

## What was evaluated

Seven **fictional** buyer situations. Five have distinct hidden SOC 2 assurance requirements; two are explicit negative controls. The baseline is the *actual five selected questions* from the frozen fictional Harborlane FINALIZE artifact. The proposed plan is the *unchanged offline* source-bound assurance-first question planner from PR #37. Both are evaluated against the same cases.

The only held-out information is the *simulated answer that a buyer might give if asked*. It is **never** passed to FINALIZE, the question planner, the persisted booking adapter, or any production code. The offline evaluator sees it solely to illustrate which human decision branch could become discussable following an answer. Every case uses the same admitted service answer and unresolved budget/timing; switching buyer scenarios **does not manufacture verified sources**.

**Evaluation target:** Can the question plan elicit the difference between a customer security questionnaire and a formal SOC 2 Type I/Type II report **without sacrificing existing first-call topical coverage or asserting unsupported facts?**

**Not evaluated:** Whether a buyer actually answers, consultant persuasiveness, conversion, source factual validity, audit readiness, legal/compliance appropriateness, fee scope, willingness to pay, or value in dollars.

## Fixed assessment criteria

1. **Assurance-type discriminator:** Actual question text must ask questionnaire versus SOC 2 report/assurance and explicitly distinguish Type I and Type II. This is deliberately stricter than simply mentioning `SOC 2` or having an intent field saying “report type.”
2. **Equivalent question budget:** No more than five first-call questions. Preserve every topical dimension covered by the original question text; do not credit declared AI intent metadata.
3. **Do not presuppose deficiencies:** The question itself may not declare failed controls or certain compliance gaps.
4. **Evidence firewall:** The recommendation requires the verified *internal* BOOK-001 booking agreement and normalized PROS-001 service choice. Mixed ISO 27001 / SOC 2 scope and synthetic/no-contact booking return no proposal.
5. **No success promotion:** Even when the fictional hidden answer is mapped to a possible advisory route, the actual prospect decision remains `NOT_ESTABLISHED`, evidence is `SIMULATED_CASE_ONLY`, outcome assurance is `NOT_MEASURED`, and no storage or delivery is authorized.

## Held-out situations and conditional consultant logic

| Fictional case | If buyer confirms the hidden requirement | Consultant's sensible **conditional** next step | What remains unknown |
| --- | --- | --- | --- |
| Procurement questionnaire only | Customer wants a questionnaire, not a SOC 2 report | Confirm required responses/proof and consider only tightly scoped evidence-mapping or questionnaire support; do not upsell a SOC 2 audit | Document scope, approval, actual evidence, budget |
| First SOC 2 Type I | Customer asks for a point-in-time Type I report | Validate control/system description and the required as-of date; coordinate scope/timing with an independent CPA auditor, without promising report issuance | Date, control design, auditor availability, fee owner |
| SOC 2 Type II operating period | Customer asks for a Type II report about controls operating during a defined period | Determine period, recurring evidence owners and readiness, then involve the independent CPA auditor in feasibility and timetable | Operating period and evidence cadence — **still insufficiently asked** by the five-question plan |
| Requirement unconfirmed | Customer only mentioned SOC 2 verbally | Obtain the original procurement requirement and accepted alternatives before scoping a paid assurance engagement | Exact requirement, decision owner, date, budget |
| Existing SOC 2 Type II | Buyer already has a report but is unsure if it satisfies the customer | Examine the report period, system boundary and actual customer objection before recommending any new project | Scope/period/objection — **still insufficiently asked** by the five-question plan |
| Mixed-framework negative control | SOC 2 **and** ISO 27001 explicitly requested | Block narrow single-service plan; seek consultant-led mixed-scope assessment | Framework priority |
| Explicit rehearsal negative control | Simulated/no-contact test | Do not offer a real-prospect question proposal or authorize outreach | N/A |

The Type I/II distinctions are grounded in AICPA guidance: Type II addresses operating effectiveness across a specified period; Type I does not express that operating-effectiveness opinion. See AICPA TSP Section 100 (https://us.aicpa.org/content/dam/aicpa/interestareas/frc/assuranceadvisoryservices/downloadabledocuments/trust-services-criteria-redlined.pdf) and AICPA SOC 2 reporting guide (https://www.aicpa.com/cpe-learning/publication/soc-2-reporting-on-an-examination-of-controls-at-a-service-organization-relevant-to-security-availability-processing-integrity-confidentiality-or-privacy). Neither advisory preparation nor CLARIS can issue a CPA attestation report.

## Interpretation of measured proxy results

The original five questions do not explicitly differentiate a questionnaire from SOC 2 Type I versus Type II. The proposed five-question plan **does**. If the automated tests pass, the expected proxy is **0/5 original versus 5/5 proposed cases with the crucial question available**, with no original topical coverage lost, while **0/5 real buyer answers and 0 real consultant ratings** remain. That 5/5 is not an independently validated product success rate and must never become a marketing claim.

It is also not evidence that the *whole* improved brief is superior. The original narrative already mentions report types, but the actual selected questions do not ask; this benchmark specifically examines that **question-plan execution gap**. In particular, two of five fictional buyer paths expose important gaps that the assurance-first fix **does not** resolve (Type II operating-period history and existing-report appropriateness).

This benchmark does not create or alter FINALIZE, the consultant preview, admission of evidence, Vercel Blob, Make modules, CRM state, outreach content, or any email.

## Proposed genuine consultant pilot (not conducted)

Before charging for “expert-level brief” intelligence, conduct blinded reviews with **two or more practicing SOC 2/GRC consultants** and anonymized, consented past opportunities or realistic independently authored case packs. Show each consultant the original and proposed brief in randomized order without disclosing which system created it. Ask them to rate, on defined 1–5 anchored scales:

- **Diagnostic specificity:** Does it isolate the customer's actual assurance requirement and control scope?
- **Evidence discipline:** Does every factual claim preserve its source and uncertainty?
- **Call efficiency:** Can the consultant ask the highest-yield questions naturally in 20–30 minutes, or are they overlong/multi-part?
- **Commercial judgment:** Is the scoped next step genuinely justified, including when the right answer is *not* to sell an audit?
- **Trustworthiness:** Are Type I/II, CPA independence, control operating periods, and client representations described correctly?

Track inter-rater disagreement, factual errors, missing questions, unsafe recommendations, and which questions the consultant would actually use. Measure time saved and ability to justify next steps from a real call before inferring ROI. Require separate operational/privacy approval before involving any real booking, customer, email or provider execution.

**Release status:** Candidate diagnostic benchmark only. No semantic certification or delivery authorization.
