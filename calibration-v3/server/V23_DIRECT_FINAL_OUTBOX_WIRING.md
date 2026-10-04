# V2.3 immediate-final (zero-question) delivery — atomic outbox wiring

Status: **isolated draft only**. This branch stacks on `v23-delivery-owner-gate-20261004` / draft PR #7. **Do not edit the active Make adapter until both server patches have been safely promoted, deployed, and separately verified.**

## Existing Make graph (read-only verified October 4)

Scenario `7533518` is an active **on-demand subscenario**; Calendly ingress `7081477` remains inactive. The current graph is Start #1 → locked Runtime GET #2 → V2.3 PREPARE #3 → Router #5 → Gmail clarification #6 or Gmail consultant FINAL #7 → ReturnData #4. Immediate-final Gmail #7 receives the locked consultant email but has no atomic receipt, audit gate or HTML escaping for its raw brief. Do not use it for live sales until protected.

## Candidate server-side outbox

`api/delivery/package.mjs` remains a single authenticated endpoint. It accepts three new values in `X-Claris-Delivery`, with the **existing Make authorization**:

**1. `direct_final_begin` BEFORE V2.3 PREPARE**: send the canonical booking identity and locked Runtime facts:

```json
{
  "opportunity_id": "{{1.opportunity_id}}",
  "consultant_id": "{{2.data.consultant_id}}",
  "consultant_delivery_email": "{{2.data.consultant_delivery_email}}",
  "consultant_sot_json": "{{2.data.runtime_v3.consultant_sot_json}}",
  "company": "{{1.company}}",
  "prospect_first_name": "{{1.prospect_first_name}}",
  "prospect_email": "{{1.prospect_email}}",
  "meeting_time": "{{1.meeting_time}}",
  "domain": "{{1.domain}}"
}
```

Server verifies the real locked consultant owner, exact SOT, verified email, canonical booking identity and a safe root HTTPS company domain. It then makes one **private create-only Blob registration** for that opportunity. Only HTTP 200 + `data.status=REGISTERED` + `data.ok=true` permits V2.3 PREPARE (#3). Preserve `data.registration_token` in the same Make execution and never log it. A duplicate, pending booking, storage timeout, wrong tenant, or malformed company domain blocks PREPARE and requires operator reconciliation. Registrations never auto-expire because a lost response may hide a running first execution.

**2. `direct_final_claim` AFTER V2.3 returns FINALIZED with zero clarification**: reuse every booking+Runtime field from step 1, append:

```json
{
  "registration_token": "{{begin.data.registration_token}}",
  "status": "{{3.status}}",
  "final_stage": "{{3.final_stage}}",
  "requires_clarification": "{{3.requires_clarification}}",
  "final_audit_json": "{{3.final_audit_json}}",
  "final_brief_markdown": "{{3.final_brief_markdown}}",
  "consultant_first_name": "{{first(split(2.data.runtime_v3.consultant_sot_json.consultant.consultant_name; \" \"))}}"
}
```

V2.3 does **not** return `consultant_first_name`; always derive the greeting from module #2's locked Runtime consultant name. Merge this object with the original booking+locked Runtime fields. The server rechecks the exact original registered booking, fresh locked consultant owner/SOT, status `FINALIZED`, stage `FINALIZE`, boolean `requires_clarification=false`, PASS audit with zero violations and no repair, and nonempty brief. It reserves delivery using ETag compare-and-swap. Only HTTP 200 + `data.status=CLAIMED` + `data.ok=true` authorizes Gmail #7. No raw Make brief may be interpolated as HTML. Use **only** the returned `data.consultant_delivery_email`, `data.subject`, and `data.html_body` (already escaped).

**3. `direct_final_ack` AFTER Gmail positively reports its message ID**:

```json
{
  "opportunity_id": "{{1.opportunity_id}}",
  "claim_token": "{{claim.data.claim_token}}",
  "provider_message_id": "{{7.id}}"
}
```

Only `ACKNOWLEDGED` confirms the provider-acknowledged receipt. If Gmail times out, the reservation remains `RESERVED`. If ACK is lost, never invoke Gmail again: consult provider logs and reconcile. This is **at-most-one authorized send attempt**, not a guarantee of exactly-once email receipt.

## Make changes after server promotion

1. Export/checkpoint existing `7533518`, ensure the live Calendly ingress stays off, and preserve the prior working branch.
2. Insert BEGIN HTTP after Runtime GET #2, before expensive V2.3 call #3. Attach a strict HTTP-200/REGISTERED gate, with non-success outcomes terminating without running Gemini.
3. Leave prospect clarification Gmail branch #6 unchanged for now. Its newly registered booking never enters the direct-final claim branch.
4. Replace immediate-final Gmail #7 with CLAIM HTTP → strict CLAIMED gate → Gmail to the **server-verified** recipient/body → ACK HTTP. Current router #5 filters are insufficient alone.
5. Send `status=DELIVERED` only after confirmed ACK; stop on all 409, 422, timeout, missing provider ID and malformed provider response. Do not hide API errors behind Make error handlers or auto-resume.
6. Run synthetic wrong-consultant/duplicate/audit-failed/unknown-send tests without Gmail, then request one explicitly budgeted provider-backed certification after remaining approval gates.

## Measured budget effects and exclusions

- Adds **one server HTTP module before PREPARE** to all bookings, and **claim + ACK HTTP** on zero-question completions. Does not add Gemini/Tavily inference. The historical zero-question baseline was 62.61 Make credits with 13 Gemini invocations; future actual usage varies.
- Uses a separate deterministic Blob receipt from the submitted clarification path and V5 private publication outbox. It does **not** migrate old emails into the new record automatically.
- The new code has no direct Gmail/Make/Gemini/Tavily calls. All tests use synthetic, in-memory atomic storage. Actual cross-request Vercel Blob contention still needs production certification.
- Neither this branch nor PR #7 should be merged blindly into an active workflow with pending legacy invitations. The migration must be staged with readback/rollback and no live traffic until certified.