# CLARIS Premium Gauntlet — Resend Gold V2

## Main brief target

### Executive Readout
Resend's public security surface already answers several low-value discovery questions. It documents SOC 2 Type II, annual third-party penetration tests, AES-256 at rest and TLS 1.3+ in transit; its API access surface spans full- or send-only API keys, OAuth 2.1 + PKCE with dynamic client registration, signed webhooks, and a hosted remote MCP server with OAuth/Bearer authentication [E1][E2][E3][E4].

The booking itself says only: **"Interested in discussing API security."** The call therefore needs to resolve two things quickly: **which trust boundary is actually in scope, and what result the prospect wants from outside help.**

### Signals That Matter

**1. Multiple credential models, not one generic API-auth surface.**  
Resend documents Bearer API keys with full-access or send-only scoping, plus OAuth 2.1 + PKCE and dynamic client registration [E1][E2].  
**Call implication:** scope the credential model first. A discussion about static-key permissions is materially different from delegated OAuth access.

**2. Webhooks are a separate inbound trust boundary.**  
Resend documents endpoint-specific signing secrets and Svix signature headers for authenticity/replay protection [E3].  
**Call implication:** if webhooks are in scope, skip "do you sign webhooks?" and establish what needs review in the verification/consumption path.

**3. MCP adds an agent-facing access surface.**  
Resend operates a hosted remote MCP server with OAuth and Bearer-token connection options [E4].  
**Call implication:** agent access is a distinct surface worth checking in scope; it is **not** evidence that MCP caused the booking.

**4. Baseline assurance is already substantial.**  
Resend publishes SOC 2 Type II, annual third-party penetration testing, AES-256 at rest and TLS 1.3+ in transit [E5].  
**Call implication:** a generic maturity/SOC 2 opener is low-value. If the desired outcome is independent validation, establish what needs validating beyond the assurance work already performed.

### Hypothesis Worth Testing
**H1 — newer delegated/agent access may be part of scope.** Resend has added OAuth 2.1 and a remote MCP surface, both of which create distinct delegated-access boundaries [E2][E4][R1]. This is only a scope hypothesis; public releases do not establish why the call was booked.

### Call Plan
1. Identify the exact API/security surface.
2. Identify the required outcome.
3. Map the confirmed combination to the consultant's service catalog; do not pitch before both are clear.

**Avoid early:** SOC 2/readiness discovery that first-party evidence already answers; any statement that OAuth, MCP, webhooks or a vulnerability caused the booking.

### Priority Questions
**D1 — Technical scope:**  
Which surface is actually in scope: API-key permissions/scoping, OAuth flows, webhook verification, MCP/agent access, or something else?

**D2 — Desired outcome:**  
What do you need from external help here: architecture/security-design guidance, independent technical validation/testing, customer-assurance/security documentation, or something else?

### Conditional Service Paths
- **SVC_VCISO_ADVISORY** — only if D2 confirms architecture/security-design guidance.
- **SVC_PENTEST** — only if D2 confirms independent technical testing/validation of a bounded surface.
- **SVC_ENTERPRISE_SECURITY** — only if D2 confirms customer-assurance/security-documentation support.

### Critical Unknowns
- **D1 TECHNICAL_SCOPE:** which API/security boundary is actually under discussion.
- **D2 DESIRED_OUTCOME:** what deliverable/result the prospect wants.

---

## Expandable Evidence / Reasoning / Unknown blocks

### [E1] API keys and permission scope
**Source:** https://resend.com/docs/api-reference/api-keys/create-api-key  
**Admitted facts:** Resend API keys can have full access or be restricted to sending.  
**Used for:** identifying API-key permission scope as one possible D1 surface.  
**Not used for:** claiming Resend mismanages keys or needs remediation.

### [E2] OAuth 2.1 + PKCE
**Source:** https://resend.com/changelog/oauth-support  
**Admitted facts:** Resend implements OAuth 2.1 + PKCE, scoped access tokens and dynamic client registration.  
**Used for:** identifying delegated authorization as a distinct D1 surface.  
**Not used for:** claiming OAuth caused the booking or is misconfigured.

### [E3] Webhook verification
**Source:** https://resend.com/docs/webhooks/verify-webhooks-requests  
**Admitted facts:** endpoint-specific signing secrets and Svix signature/timestamp/id headers are documented for webhook verification and replay protection.  
**Used for:** identifying inbound webhook verification as a separate D1 surface.  
**Not used for:** claiming a webhook vulnerability or bad client implementation.

### [E4] Remote MCP surface
**Source:** https://resend.com/changelog/remote-mcp-server  
**Admitted facts:** Resend provides a hosted remote MCP server with OAuth and Bearer-token connection options.  
**Used for:** identifying agent-facing access as a distinct D1 surface.  
**Not used for:** claiming agent integrations created security risk or motivated the booking.

### [E5] Existing assurance baseline
**Source:** https://resend.com/security/gdpr  
**Admitted facts:** SOC 2 Type II; annual third-party penetration tests; AES-256 at rest; TLS 1.3+ in transit.  
**Used for:** suppressing generic baseline-maturity/SOC 2 discovery and contextualizing any request for additional independent validation.  
**Not used for:** claiming the platform is secure in every respect or that testing is unnecessary.

### [R1] Why OAuth/MCP is a hypothesis, not a conclusion
**Premises:** booking says API security; Resend publicly exposes several materially different access surfaces; OAuth and remote MCP are newer delegated-access surfaces.  
**Bounded observation:** OAuth/MCP deserves to be among the scope options presented to the prospect.  
**Not a claim of:** booking cause, vulnerability, urgency, or service need.

### [U1] Technical scope
The booking does not identify the relevant API/security boundary. D1 resolves this. Until then CLARIS must not choose OAuth, keys, webhooks, MCP or another surface as the problem.

### [U2] Desired outcome
The booking does not identify the wanted deliverable. D2 resolves whether the relevant path is advisory, independent testing/validation, assurance documentation, or something else.
