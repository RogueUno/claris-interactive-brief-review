import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendlyBooking } from '../../../calibration-v3/server/calendly-booking-normalizer.mjs';
import { buildRuntimeV3Export } from '../../../calibration-v3/server/runtime-export.mjs';
import { createDirectFinalOutbox } from '../../../calibration-v3/server/direct-final-outbox.mjs';

// Contract-composition smoke test only. No Make, Gemini, Tavily, Calendly or
// Gmail requests are made. Models and audits are explicitly synthetic.
test('website-only Calendly → locked Runtime → BEGIN → FINALIZE claim → Gmail ACK', async () => {
  const consultantId = 'consultant_demo_001';
  const ownerEmail = 'demo-consultant@example.org';
  const sot = {
    consultant: { consultant_name: 'Alex Consultant', firm: 'Demo GRC' },
    services: [{ service_id: 'ADVISORY', name: 'vCISO advisory' }]
  };
  const identity = { consultant_id: consultantId, delivery_email: ownerEmail };
  const envelope = {
    consultant_id: consultantId,
    lifecycle_record: {
      consultant_id: consultantId,
      status: 'LOCKED',
      runtime_v3: {
        status: 'READY',
        consultant_sot_json: sot,
        report: { errors: [], warnings: [] }
      }
    }
  };
  const bookingEvent = normalizeCalendlyBooking({
    consultant_id: consultantId,
    require_company_website_answer: true,
    event: {
      uri: 'https://api.calendly.com/scheduled_events/booking-1234',
      start_time: '2026-10-09T15:00:00Z'
    },
    invitee: {
      uri: 'https://api.calendly.com/scheduled_events/booking-1234/invitees/r001-book',
      name: 'Robin Security',
      email: 'robin@trust-audit.io',
      questions_and_answers: [
        { question: 'Company website', answer: 'https://trust-audit.io' },
        { question: 'Please share anything that will help prepare for our meeting.',
          answer: 'We need governance advisory.' }
      ]
    }
  });
  assert.equal(bookingEvent.ok, true);
  assert.equal(bookingEvent.provenance.domain, 'QUESTION_DOMAIN');
  assert.equal(bookingEvent.provenance.company, 'DOMAIN_LABEL');
  assert.equal(bookingEvent.booking.company, 'Trust Audit');

  const runtime = buildRuntimeV3Export(envelope, 'etag-runtime-1');
  assert.equal(runtime.ok, true);
  const canonical = {
    ...bookingEvent.booking,
    consultant_id: runtime.consultant_id,
    consultant_delivery_email: identity.delivery_email,
    consultant_sot_json: runtime.runtime_v3.consultant_sot_json
  };

  let rev = 0;
  const map = new Map();
  const storage = {
    async getJsonWithMeta(path) {
      const prev = map.get(path);
      return prev ? structuredClone(prev) : { value: null, etag: null };
    },
    async putJsonIfAbsent(path, value) {
      if (map.has(path)) throw new Error('BLOB_ALREADY_EXISTS');
      const etag = 'etag-' + ++rev;
      map.set(path, { value: structuredClone(value), etag });
      return { etag };
    },
    async putJson(path, value, { ifMatch } = {}) {
      const prev = map.get(path);
      if (!prev || prev.etag !== ifMatch) throw new Error('BLOB_PRECONDITION_FAILED');
      const etag = 'etag-' + ++rev;
      map.set(path, { value: structuredClone(value), etag });
      return { etag };
    }
  };
  const consultantRepository = {
    async loadIdentity() { return identity; },
    async loadProfileEnvelopeWithMeta() {
      return { envelope, etag: 'etag-runtime-1' };
    }
  };
  const outbox = createDirectFinalOutbox({ storage, consultantRepository });
  const begin = await outbox.begin(canonical);
  assert.equal(begin.status, 'REGISTERED');
  const final = {
    ...canonical,
    registration_token: begin.registration_token,
    final_stage: 'FINALIZE',
    status: 'FINALIZED',
    requires_clarification: false,
    final_audit_json: JSON.stringify({
      audit_status: 'PASS', violations: [], repair_required: false
    }),
    final_brief_markdown: '# CLARIS review\nFollow verified evidence.',
    consultant_first_name: 'Alex'
  };
  const claim = await outbox.claim(final);
  assert.equal(claim.status, 'CLAIMED');
  assert.equal(claim.consultant_delivery_email, identity.delivery_email);
  assert.match(claim.html_body, /Follow verified evidence/);

  // Provider receipt is synthetic; no email sent.
  const ack = await outbox.acknowledge({
    opportunity_id: canonical.opportunity_id,
    claim_token: claim.claim_token,
    provider_message_id: 'synthetic-gmail-message-01'
  });
  assert.equal(ack.status, 'ACKNOWLEDGED');
  const repeated = await outbox.begin(canonical);
  assert.equal(repeated.status, 'SKIPPED_ALREADY_SENT');
});
