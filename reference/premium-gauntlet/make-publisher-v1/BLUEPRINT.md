# CLARIS — Make Publisher V1 Blueprint

Status: sandbox contract only. Do not activate production ingress.

## Goal

Publish one already-certified Premium PREPARE V3.6 + Discovery Intelligence V1.2 artifact, receive one private brief link plus one compact consultant email package, and send that email exactly once as far as the Make runtime can reasonably guarantee.

Make MUST NOT:
- decide discovery dimensions;
- rewrite PREPARE or Discovery;
- re-score the opportunity;
- receive the consultant's full rich profile or full consultant SOT;
- synthesize certification flags;
- construct public brief URLs itself;
- persist raw private brief tokens.

## Mandatory scenario settings

- **Keep data confidential: YES.** The publish response/email package contains a private fragment-token URL. Do not retain module input/output payloads in Make execution history.
- Do not rely on incomplete-execution payload recovery for this scenario. If a run fails, rerun from the upstream certified opportunity state; publication idempotency will reuse the same brief for unchanged artifacts.
- Keep production publisher inactive until Gate G certification.
- Do not place the private URL/token in persistent Make variables, notes, or generic data stores. Only the notification receipt stores the dedupe key/publication id, never the raw URL.

Reference: Make Scenario settings — https://help.make.com/scenario-settings

## Scenario input

Required:
- opportunity_id
- consultant_id
- consultant_delivery_email
- company
- premium_prepare_json
- discovery_plan_json
- consultant_services_projection_json
  - array of { service_id, name } only
- budget_required_before_first_call
  - boolean only
- certification_json
  - must already be produced by the upstream certified-publication path
  - schema_version = CLARIS_PRECALL_CERTIFICATION_V1
  - premium_semantic_pass = true
  - discovery_semantic_pass = true
  - premium_deterministic_pass = true
  - discovery_deterministic_pass = true

Optional presentation context:
- consultant_first_name
- prospect_name
- prospect_role
- meeting_time
- ttl_days (default 7)

Never accept the full consultant SOT when the minimized services projection and budget policy boolean are available.

## Step 1 — Validate and map minimized publish-ready body

Parse:
- premium_prepare_json -> prepare
- discovery_plan_json -> discovery
- consultant_services_projection_json -> services
- certification_json -> certification

Fail closed unless:
- prepare.schema_version == CLARIS_PREMIUM_PREPARE_V3_6
- discovery.schema_version == CLARIS_DISCOVERY_INTELLIGENCE_V1_2
- certification.schema_version == CLARIS_PRECALL_CERTIFICATION_V1
- all four certification pass flags are exactly true
- services is a non-empty array containing only service_id + name
- budget_required_before_first_call is boolean
- opportunity_id, consultant_id, consultant_delivery_email, company are non-empty

Make must only transport the upstream certification envelope. It must not infer PASS from model text, invent missing gates, or coerce failed gates to true.

Request body:
```json
{
  "opportunity_id": "...",
  "consultant_id": "...",
  "consultant_delivery_email": "...",
  "consultant_first_name": "...",
  "company": "...",
  "prospect_name": "...",
  "prospect_role": "...",
  "meeting_time": "...",
  "ttl_days": 7,
  "brief_payload": {
    "prepare": {},
    "discovery": {}
  },
  "validation_context": {
    "services": [
      {"service_id":"...","name":"..."}
    ],
    "commercial_rules": {
      "budget_required_before_first_call": false
    }
  },
  "certification": {
    "schema_version": "CLARIS_PRECALL_CERTIFICATION_V1",
    "premium_semantic_pass": true,
    "discovery_semantic_pass": true,
    "premium_deterministic_pass": true,
    "discovery_deterministic_pass": true
  }
}
```

Never send:
- commercial floor amount
- budget_rule text
- private notes
- margins/economics
- profile-only calibration content
- the full consultant SOT
- audit chain-of-thought

## Step 2 — Publish through existing delivery gateway

HTTP:
- POST /api/delivery/package
- Authorization: Bearer <CLARIS_MAKE_KEY>
- Content-Type: application/json
- X-Claris-Delivery: brief_publish_ready

The gateway:
1. verifies the certification envelope;
2. preflights the consultant notification package;
3. re-runs deterministic delivery validation;
4. derives an idempotent publication identity from opportunity + consultant + certified artifact + validation policy;
5. persists the private brief;
6. creates the private fragment-token URL;
7. returns the ready-to-send email package.

Expected first response: HTTP 201.
Expected identical retry: HTTP 200 with reused=true.

Both are successful only when body.ok=true.

Response fields used by Make:
- publication_id
- reused
- notification_dedupe_key
- brief.brief_id
- brief.brief_url
- brief.expires_at
- delivery.kind
- delivery.to
- delivery.subject
- delivery.text_body
- delivery.html_body
- delivery.metadata

Make MUST NOT extract/store the fragment token separately from brief.brief_url.

## Step 3 — Notification dedupe check

Use notification_dedupe_key as the stable receipt key.

Before Gmail send:
- look up key in a dedicated CLARIS delivery receipt store;
- if status=SENT, skip send and return existing receipt;
- otherwise continue.

Do not reuse consultant Runtime/SOT keychain storage for notification receipts.

Receipt record minimum:
```json
{
  "notification_dedupe_key":"CONSULTANT_BRIEF_READY:pub_...",
  "publication_id":"pub_...",
  "opportunity_id":"...",
  "status":"SENT",
  "sent_at":"...",
  "provider_message_id":"..."
}
```

## Step 4 — Gmail Send

Map only the returned delivery package:
- To = delivery.to
- Subject = delivery.subject
- HTML body = delivery.html_body
- Plain fallback = delivery.text_body if module supports it

No Make-authored prose.

## Step 5 — Persist delivery receipt

Only after Gmail confirms success:
- write SENT receipt;
- include provider message id when available.

If Gmail fails:
- do not mark SENT;
- surface failure for retry.

## Retry semantics

Same opportunity + same certified artifact:
- same publication_id
- same private brief URL
- reused=true on retry
- same notification_dedupe_key

Changed certified PREPARE/Discovery/policy projection:
- new publication_id
- new private brief URL

Changed meeting time/prospect presentation context only:
- same publication_id
- same private URL
- private brief context updates in place

Revoked publication:
- retry returns HTTP 410 BRIEF_PUBLICATION_REVOKED
- never resurrect automatically

## Fail-closed branches

Do not send Gmail when gateway returns:
- 401 MAKE_UNAUTHORIZED
- 410 BRIEF_PUBLICATION_REVOKED / BRIEF_PUBLICATION_EXPIRED
- 422 certification/artifact/policy validation error
- 5xx packaging/storage error

Do not fall back to old CONSULTANT_FINAL email if premium publication fails.

## Promotion gate

Publisher sandbox may be considered certified only after:
1. Resend gold publishes and sends once;
2. Linear gold publishes and sends once;
3. Supabase gold publishes and sends once;
4. identical retry skips duplicate email;
5. changed meeting time reuses the same publication;
6. missing/false certification is rejected before persistence;
7. bad economics-leak payload is rejected before persistence;
8. revoked brief cannot be reopened or republished;
9. production Calendly ingress remains inactive during certification.
