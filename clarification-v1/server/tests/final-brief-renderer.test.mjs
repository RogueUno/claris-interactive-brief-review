import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinalArtifact, renderFinalBrief } from '../final-brief-renderer.mjs';

test('renders current strategic_guidance schema without blank metrics', () => {
  const artifact = {
    claris_brief_metadata: {
      consultant_name: 'Jordan Vale',
      firm: 'Priority Stack Advisory',
      target_company: 'Acme',
      target_domain: 'https://acme.example'
    },
    deterministic_metrics: {
      supported_match_score: 65,
      scorable_coverage_score: 75,
      evaluated_fit_rate: 86.5,
      evidence_completeness_score: 74.75
    },
    strategic_guidance: {
      qualification_status: 'QUALIFIED',
      primary_service_id: 'SVC_API_AUDIT',
      recommended_action: 'Proceed with focused discovery.',
      rationale: 'Service alignment is supported.',
      key_talking_points: ['API scope', 'OAuth flows'],
      risk_factors: ['Decision-maker not present']
    },
    match_classifications: {
      service_need_alignment: { status: 'MATCH', reason: 'Direct booking evidence.' },
      timing_urgency: { status: 'UNKNOWN', reason: 'No deadline stated.' }
    }
  };

  const rendered = renderFinalBrief(artifact);
  assert.equal(rendered.ok, true);
  assert.match(rendered.brief_markdown, /Supported Match: 65\/100/);
  assert.match(rendered.brief_markdown, /Primary service: SVC_API_AUDIT/);
  assert.match(rendered.brief_markdown, /Timing Urgency: UNKNOWN/);
});

test('normalizes legacy brief_metadata and strategic_recommendations schema', () => {
  const artifact = {
    brief_metadata: {
      consultant: { consultant_name: 'Jordan Vale', firm: 'Priority Stack Advisory' },
      target_firm: { company_name: 'Acme', domain: 'https://acme.example' }
    },
    deterministic_metrics: {
      supported_match: 60,
      scorable_coverage: 70,
      evaluated_fit_rate: 85,
      evidence_completeness: 68
    },
    qualification_status: 'QUALIFIED',
    scope_analysis: { primary_service_id: 'SVC_API_AUDIT' },
    strategic_recommendations: {
      recommended_action: 'Proceed to discovery.',
      key_talking_points: ['Clarify API surfaces'],
      risk_factors: ['Scope remains incomplete']
    },
    canonical_match_classifications: {
      engagement_economics: { status: 'MATCH', reason: 'Prospect-reported budget meets floor.' }
    }
  };

  const normalized = normalizeFinalArtifact(artifact);
  assert.equal(normalized.company, 'Acme');
  assert.equal(normalized.metrics.supported_match, 60);
  assert.equal(normalized.primary_service_id, 'SVC_API_AUDIT');
  assert.equal(normalized.recommended_action, 'Proceed to discovery.');
});

test('renders minimal client_profile plus metrics schema without inventing qualification', () => {
  const artifact = {
    client_profile: {
      company_name: 'Acme',
      domain: 'https://acme.example'
    },
    metrics: {
      supported_match: 50,
      scorable_coverage: 50,
      evaluated_fit_rate: 100,
      evidence_completeness: 74
    },
    match_classifications: {
      service_need_alignment: { status: 'MATCH', reason: 'Booking text supports the need.' },
      business_trigger: { status: 'UNKNOWN', reason: 'No direct business trigger evidence.' }
    },
    potential_service_relevance: [
      { service_id: 'SVC_API_AUDIT', status: 'DIRECT_MATCH' }
    ],
    talking_points: ['Review OAuth token flows']
  };

  const rendered = renderFinalBrief(artifact);
  assert.match(rendered.brief_markdown, /Status: Not explicitly classified/);
  assert.match(rendered.brief_markdown, /Primary service: SVC_API_AUDIT/);
  assert.match(rendered.brief_markdown, /Supported Match: 50\/100/);
  assert.match(rendered.brief_markdown, /Business Trigger: UNKNOWN/);
  assert.match(rendered.brief_markdown, /Review OAuth token flows/);
});


test('supports metadata plus historical_signals schema emitted by frozen FINALIZE', () => {
  const artifact = {
    metadata: {
      consultant_name: 'Jordan Vale',
      firm_name: 'Priority Stack Advisory',
      target_company: 'Instructure',
      target_domain: 'https://instructure.com'
    },
    deterministic_metrics: {
      supported_match_score: 65,
      scorable_coverage_score: 70,
      evaluated_fit_rate: 92.8,
      evidence_completeness_score: 80
    },
    canonical_match_classifications: {
      service_need_alignment: { status: 'MATCH', reason: 'Booking supports the service need.' }
    },
    strategic_guidance: {
      qualification_status: 'QUALIFIED',
      primary_service_id: 'SVC_API_AUDIT',
      recommended_action: 'Scope the API audit.'
    },
    consultant_only_context: {
      historical_signals: [{
        evidence_id: 'FAC-007',
        description: 'Historical public incident context.',
        relevance_limitations: 'Historical context only; do not infer current weakness.'
      }]
    }
  };

  const rendered = renderFinalBrief(artifact);
  assert.match(rendered.brief_markdown, /Company: Instructure/);
  assert.match(rendered.brief_markdown, /Consultant: Jordan Vale/);
  assert.match(rendered.brief_markdown, /Historical public incident context/);
  assert.match(rendered.brief_markdown, /Historical context only; do not infer current weakness/);
});


test('unwraps a complete quoted JSON artifact and normalizes formatted metrics', () => {
  const artifact = {
    metadata: {
      consultant_name: 'Jordan Vale',
      firm_name: 'Priority Stack Advisory',
      target_company: 'Instructure',
      target_domain: 'https://instructure.com'
    },
    deterministic_metrics: {
      supported_match_score: '50/100',
      scorable_coverage_score: '50/100',
      evaluated_fit_rate: '100%',
      evidence_completeness_score: '80/100'
    },
    strategic_guidance: {
      qualification_status: 'QUALIFIED',
      primary_service_id: 'SVC_API_AUDIT',
      recommended_action: 'Proceed with scoped discovery.'
    }
  };

  const doubleEncoded = JSON.stringify(JSON.stringify(artifact));
  const normalized = normalizeFinalArtifact(doubleEncoded);
  assert.equal(normalized.company, 'Instructure');
  assert.equal(normalized.metrics.supported_match, 50);
  assert.equal(normalized.metrics.scorable_coverage, 50);
  assert.equal(normalized.metrics.evaluated_fit_rate, 100);
  assert.equal(normalized.metrics.evidence_completeness, 80);

  const rendered = renderFinalBrief(doubleEncoded);
  assert.match(rendered.brief_markdown, /Supported Match: 50\/100/);
  assert.match(rendered.brief_markdown, /Evaluated Fit Rate: 100%/);
});

test('fails closed when a quoted FINAL artifact contains truncated JSON', () => {
  const truncated = JSON.stringify('{"metadata":{"target_company":"Instructure"}');
  assert.throws(
    () => normalizeFinalArtifact(truncated),
    /FINAL_ARTIFACT_INVALID_JSON/
  );
});
