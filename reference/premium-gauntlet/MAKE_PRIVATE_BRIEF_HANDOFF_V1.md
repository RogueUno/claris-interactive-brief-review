# CLARIS Certified Private Brief — Make Handoff V1

## Status
Sandbox integration contract. Do not enable production Calendly ingress until the three golden cases pass through the live chain.

## Single delivery operation
Make performs one authenticated HTTP POST to the existing CLARIS delivery gateway:

- Method: POST
- Path: /api/delivery/package
- Header: X-Claris-Delivery: brief_publish_ready
- Header: Authorization: Bearer <CLARIS_MAKE_KEY>
- Content-Type: application/json

The Make key is never stored in scenario notes or user-visible output.

## Body authority
The body MUST be produced from the certified-publication adapter contract. Make must not add, infer, rename, or synthesize discovery fields.

Required body:
- opportunity_id
- consultant_id
- consultant_delivery_email
- consultant_first_name optional
- company
- prospect_name optional
- prospect_role optional
- meeting_time optional
- ttl_days
- brief_payload.prepare = CLARIS_PREMIUM_PREPARE_V3_6
- brief_payload.discovery = CLARIS_DISCOVERY_INTELLIGENCE_V1_2
- validation_context.services = service_id + name only
- validation_context.commercial_rules.budget_required_before_first_call = boolean only

Never send:
- full calibration profile
- commercial floor
- private service economics
- exceptions/profile-only fields
- raw evidence credentials
- API keys
- semantic-audit chain-of-thought

## Preconditions
The request may be emitted only when all are true:
1. Premium semantic audit_status = PASS
2. Premium deterministic validation ok = true
3. Discovery semantic audit_status = PASS
4. Discovery deterministic validation ok = true

If any precondition fails, do not publish and do not email.

## Successful response
HTTP 201 first publication, HTTP 200 idempotent reuse.

Response fields used by Make:
- ok
- publication_id
- reused
- notification_dedupe_key
- brief.brief_id
- brief.brief_url
- brief.expires_at
- delivery.kind = CONSULTANT_BRIEF_READY
- delivery.to
- delivery.subject
- delivery.text_body
- delivery.html_body

The response deliberately does not expose a top-level raw brief token.

## Email action
After a successful gateway response, Make sends exactly the returned delivery package through the consultant email connection.

Before sending, dedupe on notification_dedupe_key.

Do not reconstruct the email from brief JSON in Make.

## Retry semantics
Retries for the same opportunity reuse the same private publication and notification_dedupe_key.

A changed meeting/prospect context may update the stored publication context without creating a second brief.

A revoked publication returns HTTP 410 and must not be silently recreated.

## Fail closed
- 401: auth/session failure — do not retry with altered credentials.
- 410: revoked/expired publication — stop and surface lifecycle failure.
- 422: deterministic contract/validation failure — do not send email.
- 500: infrastructure failure — retry only according to existing bounded infrastructure retry policy; never change intelligence to make it pass.

## Production promotion gate
Do not merge/activate until:
- Resend live publish chain passes
- Linear live publish chain passes
- Supabase live publish chain passes
- anonymous brief access fails closed
- valid fragment resolves to HttpOnly session
- refresh resumes session
- revocation invalidates existing session
- invalid intelligence cannot publish
- duplicate lifecycle invocation produces one publication + one email
