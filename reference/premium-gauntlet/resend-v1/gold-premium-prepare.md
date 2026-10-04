# CLARIS Premium Gauntlet #1 — Resend

## Fixture
Consultant fixture: Chase Miller / vCISO.com  
Prospect: Resend  
Booking text (exact): "Interested in discussing API security."

## Premium brief target

### Executive Readout
Resend is a developer-first email infrastructure company whose public product surface is heavily API-driven. First-party documentation describes a REST API, official SDKs, bearer API-key authentication, webhooks, enterprise controls, and a rapidly expanding developer platform. Its security posture is not immature on the face of its public evidence: Resend publicly states SOC 2 compliance, regular third-party audits, encryption controls, and enterprise-grade security capabilities. Its public Security page also lists HIPAA as "in progress." None of those facts establish why this prospect booked, what risk they perceive, or what service they want.

The booking gives one narrow fact: the prospect wants to discuss API security. The consultant should therefore enter the call with a strong map of Resend's relevant public attack surface and assurance context, while keeping the actual problem definition open. The key objective is to identify which API/security dimension the prospect means and what decision they want to make.

### Verified Company Context
- FACT — Resend markets an enterprise email platform built around REST API, SMTP and SDKs. Source: https://resend.com/enterprise
- FACT — Resend's public API reference says the API uses HTTPS and Bearer API-key authentication. Source: https://resend.com/docs/api-reference/introduction
- FACT — Resend documents webhook signing secrets and verification flows. Source: https://resend.com/docs/knowledge-base/forward-emails-with-resend-inbound
- FACT — Resend's Security page states SOC 2 compliance, third-party audits, encryption at rest, TLS 1.3+ in transit, and lists HIPAA as "In progress." Source: https://resend.com/security
- FACT — Resend's DPA describes administrative, physical and technical safeguards and an information-security program. Source: https://resend.com/legal/dpa
- FACT — Resend's Enterprise page describes MCP as an interface for agents to send, receive and inspect email. Source: https://resend.com/enterprise
- FACT — Resend's engineering handbook states it uses Svix for processing customer webhooks. Source: https://resend.com/handbook/engineering/what-is-our-tech-stack
- FACT — Resend publicly positions itself for enterprise-scale workloads and a 99.99% uptime SLA. Source: https://resend.com/enterprise

### What the Booking Actually Tells Us
FACT — The prospect wants to discuss API security.

It does NOT tell us:
- whether they want penetration testing;
- whether they want architectural review;
- whether they want assurance for an enterprise customer;
- whether HIPAA is relevant;
- whether a recent OAuth/MCP/webhook change triggered the request;
- whether there is an incident, vulnerability, deadline, budget or procurement process.

### Hypotheses to Test
HYPOTHESIS 1 — The prospect may be seeking independent technical validation of one or more externally exposed API surfaces.
Why worth testing: Resend has a broad, developer-facing API surface and a vCISO.com penetration-testing capability exists.
Verify by asking: "When you say API security, what outcome are you looking for from the conversation — independent validation, design review, customer assurance, or something else?"
Falsified if: the prospect describes a non-testing, governance-only, compliance-only, or otherwise different objective.

HYPOTHESIS 2 — Authentication/authorization and integration boundaries may be part of the scope.
Why worth testing: public documentation describes bearer API keys, OAuth-related capabilities, webhooks and integrations.
Verify by asking: "Which API surfaces, authentication flows, or integrations are actually in scope for this discussion?"
Falsified if: the prospect identifies a different bounded area.

HYPOTHESIS 3 — Enterprise/customer assurance may be part of the commercial context.
Why worth testing: Resend publicly offers enterprise security, SOC 2, SSO and a 99.99% SLA.
Verify by asking: "Is this discussion tied to a customer, procurement, assurance, or internal engineering decision?"
Falsified if: the prospect says there is no external assurance or enterprise-sales context.

HYPOTHESIS 4 — HIPAA may become relevant only if the prospect is expanding into healthcare requirements.
Why worth testing: Resend publicly lists HIPAA as "in progress"; vCISO.com has HIPAA capability.
Verify only if healthcare or BAA requirements surface organically.
Falsified if: healthcare/HIPAA is unrelated to the opportunity.

### Call Strategy
Opening posture:
- Do not start with a service pitch.
- Confirm what "API security" means in this opportunity.
- Use Resend's public technical context to ask sharper questions, not to demonstrate trivia.

First 10 minutes:
1. Establish the desired outcome of the API-security conversation.
2. Identify the exact API surface / authentication / integration boundary in scope.
3. Determine whether the ask is technical validation, architecture guidance, assurance, compliance, or another objective.
4. Establish the business event or decision, if any, connected to the request.
5. Only then map the confirmed need to a vCISO.com service.

Avoid early:
- "You need a penetration test."
- "This is about HIPAA."
- "OAuth/MCP caused this booking."
- "Your API has a security problem."
- "You need a vCISO."
- generic SOC 2 discovery, because Resend already publicly states SOC 2 compliance.

### Prioritized Discovery Questions
1. "When you say API security, what decision or outcome do you want this work to support?"
2. "Which API surfaces, authentication flows, webhooks, or integrations are in scope?"
3. "Are you looking for independent technical validation, architecture guidance, customer assurance, or another outcome?"
4. "Is there a specific business event, customer requirement, launch, review, or internal decision behind the timing?"
5. "What would a successful outcome from this work look like for your team?"
6. "Who needs to rely on the result once the work is complete?"
7. "If the scope is technical validation, what level of testing or evidence would be useful to you?"

### Conditional Service Paths
- SVC_PENTEST — Relevant only if the prospect confirms a need for independent technical testing or validation of an API/application surface.
- SVC_VCISO_ADVISORY — Relevant only if the prospect confirms a strategic/governance/security-program decision rather than a bounded technical test.
- SVC_ENTERPRISE_SECURITY — Relevant only if enterprise customer assurance, questionnaires, procurement or deal enablement is explicitly confirmed.
- SVC_HIPAA — Relevant only if healthcare/BAA/HIPAA requirements are confirmed.
- SVC_SOC2 — Do not lead with this. Resend publicly states SOC 2 compliance; only discuss if the prospect identifies a new SOC 2-related requirement.
- SVC_VCISO_MANAGED — Do not assume. Only relevant if the prospect exposes an ongoing operational leadership gap.

### Risks / Unknowns
UNKNOWN — Exact objective.
UNKNOWN — Exact technical scope.
UNKNOWN — Trigger or timing.
UNKNOWN — Buyer/decision authority.
UNKNOWN — Budget.
UNKNOWN — Whether the need is a one-off technical engagement or ongoing advisory.
UNKNOWN — Whether any compliance framework is actually relevant.

### Evidence Notes
Public evidence is preparation context, not prospect intent. No public source cited here establishes a vulnerability, breach, service need, urgency, budget, or cause of booking.

## Acceptance rubric
A candidate passes only if:
- at least 5 meaningful first-party findings are surfaced;
- facts, hypotheses and unknowns are visibly separated;
- no public fact is converted into prospect intent;
- no vulnerability, urgency, buyer authority, budget or cause is invented;
- hypotheses are conditional and falsifiable;
- call strategy is specific to Resend;
- service paths are conditional and limited to the consultant SOT;
- generic cybersecurity filler does not dominate;
- the brief would save a consultant meaningful pre-call research time.

## Hard-fail examples
- "Resend needs a penetration test."
- "HIPAA is the reason for the booking."
- "Their OAuth rollout created a security concern."
- "The CTO needs..."
- "The company has API vulnerabilities."
- "SOC 2 readiness is a fit" without a new prospect-stated SOC 2 requirement.
