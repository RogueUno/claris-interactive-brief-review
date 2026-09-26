import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeliveryPackage,
  buildProspectClarificationDelivery,
  buildConsultantFinalDelivery,
  buildConsultantBriefReadyDelivery
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
    final_brief_markdown: '# CLARIS Opportunity Brief\n\n**Status:** QUALIFIED_FOR_DISCOVERY\n\n- API security need'
  });

  assert.equal(result.kind, 'CONSULTANT_FINAL');
  assert.equal(result.to, 'sarah@northstar.example');
  assert.equal(result.subject, 'CLARIS — Acme / Alex Morgan');
  assert.match(result.text_body, /Status: QUALIFIED_FOR_DISCOVERY/);
  assert.doesNotMatch(result.text_body, /\*\*/);
});

test('builds compact consultant private-brief notification', () => {
  const result = buildConsultantBriefReadyDelivery({
    opportunity_id: 'opp_3',
    brief_id: 'brief_abc123',
    consultant_delivery_email: 'sarah@northstar.example',
    consultant_first_name: 'Sarah',
    company: 'Acme',
    prospect_name: 'Alex Morgan',
    meeting_time: '2026-09-28T09:30:00Z',
    executive_readout: '**Acme already publishes the baseline controls.** Focus on the unresolved API boundary and desired review outcome.',
    priority_questions_json: JSON.stringify([
      'Which API or authentication surface is actually in scope?',
      'What result do you need from external help?',
      'This third question is allowed.',
      'This fourth question must not appear.'
    ]),
    brief_url: 'https://preview.example/brief-v1/#brief=opaque-token',
    expires_at: '2026-10-03T09:30:00.000Z'
  });

  assert.equal(result.kind, 'CONSULTANT_BRIEF_READY');
  assert.equal(result.to, 'sarah@northstar.example');
  assert.equal(result.subject, 'CLARIS — Acme / Alex Morgan brief ready');
  assert.match(result.text_body, /Your CLARIS pre-call intelligence is ready/);
  assert.match(result.text_body, /baseline controls/);
  assert.match(result.text_body, /Which API or authentication surface/);
  assert.match(result.text_body, /What result do you need/);
  assert.match(result.text_body, /This third question is allowed/);
  assert.doesNotMatch(result.text_body, /This fourth question/);
  assert.match(result.text_body, /https:\/\/preview\.example\/brief-v1\/#brief=opaque-token/);
  assert.doesNotMatch(result.text_body, /\*\*/);
  assert.equal(result.metadata.priority_question_count, 3);
});

test('dispatches private brief notification through delivery package', () => {
  const result = buildDeliveryPackage('CONSULTANT_BRIEF_READY', {
    consultant_delivery_email: 'sarah@northstar.example',
    company: 'Acme',
    executive_readout: 'High-signal account context.',
    brief_url: 'https://preview.example/brief-v1/#brief=opaque'
  });
  assert.equal(result.kind, 'CONSULTANT_BRIEF_READY');
});

test('private brief notification fails closed on insecure or missing links', () => {
  assert.throws(
    () => buildConsultantBriefReadyDelivery({
      consultant_delivery_email: 'sarah@northstar.example',
      company: 'Acme',
      executive_readout: 'Useful.',
      brief_url: 'http://example.com/brief'
    }),
    /PRIVATE_BRIEF_URL_REQUIRED/
  );
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
