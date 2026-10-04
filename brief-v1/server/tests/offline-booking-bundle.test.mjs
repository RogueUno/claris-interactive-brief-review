import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCalendlyBooking } from '../../../calibration-v3/server/calendly-booking-normalizer.mjs';
import { buildRuntimeV3Export } from '../../../calibration-v3/server/runtime-export.mjs';
import { compileCertifiedBriefPublication } from '../certified-publication-adapter.mjs';
import { buildConsultantFinalDelivery } from '../../../calibration-v3/server/pilot-delivery.mjs';

// Provider-free contract composition only, NOT a replacement for live Gemini
// certification. Here "zero-question" means no prospect clarification needed;
// the consultant's discovery plan may still contain questions.
function booking({ website = 'https://acme.example.org' } = {}) {
  const answers = [{ question: 'What should we know?', answer: 'Please review security risks.' }];
  if (website) answers.unshift({ question: 'Company website', answer: website });
  return normalizeCalendlyBooking({
    consultant_id: 'consultant_alpha',
    require_company_website_answer: true,
    event: {
      uri: 'https://api.calendly.com/scheduled_events/meeting123',
      start_time: '2026-10-09T15:00:00Z'
    },
    invitee: {
      uri: 'https://api.calendly.com/scheduled_events/meeting123/invitees/alex123',
      name: 'Alex Engineer', email: 'alex@acme.example.org',
      questions_and_answers: answers
    }
  });
}

const sot = {
  services: [{ service_id: 'SVC_ADVISORY', name: 'Advisory vCISO' }],
  commercial_rules: {
    budget_required_before_first_call: false,
    minimum_viable_engagement_usd: 7500
  }
};
const lockedProfile = {
  consultant_id: 'consultant_alpha',
  lifecycle_record: {
    consultant_id: 'consultant_alpha',
    status: 'LOCKED',
    runtime_v3: {
      status: 'READY', consultant_sot_json: sot,
      report: { errors: [], warnings: [], adapter_version: 'test' }
    }
  }
};
const prepare = {
  schema_version: 'CLARIS_PREMIUM_PREPARE_V3_6',
  executive_readout: 'Security readiness opportunity.',
  open_dimensions: [{ dimension_id: 'D1', max_questions: 1 }]
};
const discovery = {
  schema_version: 'CLARIS_DISCOVERY_INTELLIGENCE_V1_2',
  authorized_dimensions: [{ dimension_id: 'D1', authority: 'PREPARE', policy_key: null }],
  commercial_target: [],
  primary_questions: [{
    question_id: 'Q1',
    dimension_id: 'D1',
    ask: 'Which security workstream is in scope?',
    linked_service_paths: [{ service_id: 'SVC_ADVISORY', condition: 'Advisory needed.' }],
    conditional_probes: []
  }],
  end_of_call_decision: {
    ready_for_next_step_if: ['Scope clear.'],
    remain_in_discovery_if: ['D1 unresolved.'],
    disqualify_or_deprioritize_if: ['Outside capabilities.']
  }
};

test('strict Calendly → locked Runtime → certified bundle → email package without providers', () => {
  const normalized = booking();
  assert.equal(normalized.ok, true);
  assert.equal(normalized.provenance.domain, 'QUESTION_DOMAIN');
  const runtime = buildRuntimeV3Export(lockedProfile, 'v1');
  assert.equal(runtime.ok, true);
  const compiled = compileCertifiedBriefPublication({
    opportunity_id: normalized.booking.opportunity_id,
    consultant_id: runtime.consultant_id,
    consultant_delivery_email: 'consultant@example.net',
    consultant_first_name: 'Chris',
    company: normalized.booking.company,
    prospect_name: normalized.booking.prospect_first_name,
    prospect_role: normalized.booking.prospect_role,
    meeting_time: normalized.booking.meeting_time,
    booking_text: normalized.booking.booking_text,
    domain: normalized.booking.domain,
    prepare, discovery,
    consultant_sot: runtime.runtime_v3.consultant_sot_json,
    premium_audit: { audit_status: 'PASS' },
    discovery_audit: { audit_status: 'PASS' },
    premium_validation: { ok: true, errors: [] },
    discovery_validation: { ok: true, errors: [] }
  });
  assert.equal(compiled.operation, 'brief_publish_ready');
  assert.equal(compiled.body.certification.premium_semantic_pass, true);
  assert.equal(compiled.body.certification.discovery_deterministic_pass, true);
  assert.equal(compiled.body.opportunity_id, normalized.booking.opportunity_id);
  assert.equal(compiled.body.consultant_id, runtime.consultant_id);
  assert.equal(compiled.body.delivery.to, 'consultant@example.net');
  assert.equal(compiled.body.brief_payload.discovery.primary_questions.length, 1);
  assert.equal(JSON.stringify(compiled.body).includes('7500'), false);

  // Stand-in certified FINALIZE artifact: no inference or email service invoked.
  const mail = buildConsultantFinalDelivery({
    opportunity_id: normalized.booking.opportunity_id,
    consultant_delivery_email: compiled.body.delivery.to,
    consultant_first_name: 'Chris',
    company: normalized.booking.company,
    prospect_first_name: normalized.booking.prospect_first_name,
    final_brief_markdown: '# Verified CLARIS Brief\nNo prospect clarification necessary.'
  });
  assert.equal(mail.to, 'consultant@example.net');
  assert.equal(mail.kind, 'CONSULTANT_FINAL');
  assert.match(mail.subject, /CLARIS/);
});

test('missing explicit website blocks booking and cannot enter the compiled contract', () => {
  const normalized = booking({ website: null });
  assert.equal(normalized.ok, false);
  assert.equal(normalized.booking.domain, null);
  assert.ok(normalized.missing.includes('company_website_answer'));
});

test('unlocked consultant and uncertified audit cannot produce a publish-ready brief', () => {
  const runtime = buildRuntimeV3Export({
    ...lockedProfile,
    lifecycle_record: { ...lockedProfile.lifecycle_record, status: 'IN_PROGRESS' }
  });
  assert.equal(runtime.ok, false);
  assert.throws(() => compileCertifiedBriefPublication({
    opportunity_id: 'opp_bad',
    consultant_id: 'consultant_alpha',
    consultant_delivery_email: 'consultant@example.net',
    company: 'Acme', prospect_name: 'Alex',
    prepare, discovery, consultant_sot: sot,
    premium_audit: { audit_status: 'FAIL' },
    discovery_audit: { audit_status: 'PASS' },
    premium_validation: { ok: true },
    discovery_validation: { ok: true }
  }), /PREMIUM_AUDIT_PASS_REQUIRED/);
});
