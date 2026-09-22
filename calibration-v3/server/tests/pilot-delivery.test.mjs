import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeliveryPackage,
  buildProspectClarificationDelivery,
  buildConsultantFinalDelivery
} from '../pilot-delivery.mjs';

test('builds low-friction prospect clarification email', () => {
  const result = buildProspectClarificationDelivery({
    opportunity_id: 'opp_1',
    prospect_email: 'alex@example.com',
    prospect_first_name: 'Alex',
    consultant_first_name: 'Sarah',
    invite_url: 'https://claris-calibration.vercel.app/clarification-v1/#invite=opaque',
    question_count: 2,
    expires_at: '2026-09-29T12:00:00.000Z'
  });

  assert.equal(result.kind, 'PROSPECT_CLARIFICATION');
  assert.equal(result.to, 'alex@example.com');
  assert.match(result.subject, /Sarah/);
  assert.match(result.text_body, /2 quick details/);
  assert.match(result.text_body, /#invite=opaque/);
  assert.doesNotMatch(result.text_body, /qualification form/i);
});

test('derives clarification count from package JSON', () => {
  const result = buildDeliveryPackage('PROSPECT_CLARIFICATION', {
    prospect_email: 'alex@example.com',
    prospect_first_name: 'Alex',
    consultant_first_name: 'Sarah',
    invite_url: 'https://example.com/private',
    clarification_package_json: JSON.stringify({ questions: [{}, {}, {}] })
  });
  assert.equal(result.metadata.question_count, 3);
});

test('refuses prospect delivery when no questions are required', () => {
  assert.throws(
    () => buildProspectClarificationDelivery({
      prospect_email: 'alex@example.com',
      prospect_first_name: 'Alex',
      consultant_first_name: 'Sarah',
      invite_url: 'https://example.com/private',
      question_count: 0
    }),
    /CLARIFICATION_QUESTION_COUNT_REQUIRED/
  );
});

test('builds consultant final email from rendered brief', () => {
  const result = buildConsultantFinalDelivery({
    opportunity_id: 'opp_2',
    consultant_delivery_email: 'sarah@northstar.example',
    consultant_first_name: 'Sarah',
    company: 'Acme',
    prospect_name: 'Alex Morgan',
    meeting_time: '2026-09-25T13:00:00Z',
    final_brief_markdown: '# CLARIS Opportunity Brief\\n\\n**Status:** QUALIFIED_FOR_DISCOVERY\\n\\n- API security need'
  });

  assert.equal(result.kind, 'CONSULTANT_FINAL');
  assert.equal(result.to, 'sarah@northstar.example');
  assert.equal(result.subject, 'CLARIS — Acme / Alex Morgan');
  assert.match(result.text_body, /Status: QUALIFIED_FOR_DISCOVERY/);
  assert.doesNotMatch(result.text_body, /\\*\\*/);
});

test('fails closed when consultant delivery email is missing', () => {
  assert.throws(
    () => buildConsultantFinalDelivery({
      company: 'Acme',
      final_brief_markdown: 'Useful brief'
    }),
    /CONSULTANT_DELIVERY_EMAIL_REQUIRED/
  );
});
