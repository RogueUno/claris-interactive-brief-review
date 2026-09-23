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


test('renders nested claris_final_brief contract emitted by V2.3 FINALIZE', () => {
  const artifact = {
    claris_final_brief: {
      brief_metadata: {
        compiler_version: 'V3_CANONICAL_TRUTH_1',
        artifact_contract: 'V3_TRUTH_BOUNDARY_3',
        report_status: 'QUALIFIED_FOR_DISCOVERY',
        lead_consultant: 'Jordan Vale',
        firm: 'Priority Stack Advisory'
      },
      deterministic_metrics: {
        supported_match: 50,
        scorable_coverage: 50,
        evaluated_fit_rate: 100,
        evidence_completeness: 68.75
      },
      match_score_explanation: {
        overall_assessment: 'The prospect requirements align directly with the consultancy services.',
        match_breakdown: {
          service_need_alignment: {
            status: 'MATCH',
            rationale: 'Explicit booking need maps to API auditing.',
            basis_ids: ['SVC_API_AUDIT', 'BOOK-001']
          },
          business_trigger: {
            status: 'UNKNOWN',
            rationale: 'No deadline stated.',
            basis_ids: []
          }
        }
      },
      preliminary_brief_markdown: '### Engagement Scope\nThe prospect is seeking an API/OAuth audit and continuous red teaming.',
      consultant_only_context: {
        historical_signals: [{
          event: 'May 2026 Data Breach',
          details: 'Historical incident context.',
          relevance: 'Context only; do not infer current weakness.'
        }],
        internal_hypotheses: [{
          hypothesis_id: 'HYP-001',
          description: 'The request may reflect heightened security sensitivity.',
          status: 'UNVERIFIED'
        }]
      },
      discovery_question_plan: [{
        question: 'Which API surfaces are highest priority?',
        intent: 'Define the technical boundary.',
        alignment_id: 'UNK-001'
      }],
      intelligence_lineage: [{
        source_id: 'BOOK-001',
        authority: 'BOOKING_TEXT',
        usage: 'Establishes primary service need.'
      }]
    }
  };

  const normalized = normalizeFinalArtifact(artifact);
  assert.equal(normalized.source_schema, 'claris_final_brief');
  assert.equal(normalized.qualification_status, 'QUALIFIED_FOR_DISCOVERY');
  assert.equal(normalized.consultant_name, 'Jordan Vale');
  assert.equal(normalized.primary_service_id, 'SVC_API_AUDIT');
  assert.equal(normalized.metrics.supported_match, 50);
  assert.equal(normalized.metrics.evidence_completeness, 68.75);

  const rendered = renderFinalBrief(artifact);
  assert.match(rendered.brief_markdown, /Status: QUALIFIED_FOR_DISCOVERY/);
  assert.match(rendered.brief_markdown, /Primary service: SVC_API_AUDIT/);
  assert.match(rendered.brief_markdown, /Supported Match: 50\/100/);
  assert.match(rendered.brief_markdown, /Evidence Completeness: 68.75\/100/);
  assert.match(rendered.brief_markdown, /Engagement Scope/);
  assert.match(rendered.brief_markdown, /Which API surfaces are highest priority/);
  assert.match(rendered.brief_markdown, /May 2026 Data Breach/);
  assert.match(rendered.brief_markdown, /Internal hypotheses/);
  assert.match(rendered.brief_markdown, /BOOK-001 \(BOOKING_TEXT\)/);
});

test('renders current flat FINALIZE schema emitted after prospect clarification', () => {
  const artifact = {
    brief_metadata: {
      consultant_name: 'Mehdi Medjahed',
      firm_name: 'Tailead',
      artifact_version: 'V3_TRUTH_BOUNDARY_3',
      compiler_contract: 'V3_CANONICAL_TRUTH_1'
    },
    prospect_overview: {
      company_name: 'Test SaaS Co',
      domain: 'https://example.com',
      booking_basis: 'BOOK-001',
      primary_interest: 'API Security Auditing'
    },
    match_summary: {
      deterministic_metrics: {
        supported_match_score: 30,
        scorable_coverage_score: 30,
        evaluated_fit_rate: 100,
        evidence_completeness_score: 74.75
      },
      qualification_status: 'PROSPECT_DISCOVERY',
      fit_rationale: 'Service alignment is confirmed through prospect reporting.'
    },
    strategic_assessment: {
      match_classifications: {
        service_need_alignment: {
          status: 'MATCH',
          basis_ids: ['PROS-001'],
          reason: 'Prospect explicitly reported the service need.'
        },
        business_trigger: {
          status: 'UNKNOWN',
          basis_ids: [],
          reason: 'No business trigger has been established.'
        }
      },
      potential_service_relevance: [{
        service_id: 'SVC_API_AUDIT',
        alignment_evidence: 'PROS-001'
      }]
    },
    evidence_log: {
      intelligence_lineage: ['BOOK-001', 'PROS-001']
    },
    discovery_guidance: {
      recommended_action: 'Conduct discovery call to qualify requirements.',
      key_talking_points: ['Confirm technical scope of API audit'],
      risk_factors: ['Unknown urgency']
    }
  };

  const normalized = normalizeFinalArtifact(artifact);
  assert.equal(normalized.company, 'Test SaaS Co');
  assert.equal(normalized.domain, 'https://example.com');
  assert.equal(normalized.consultant_name, 'Mehdi Medjahed');
  assert.equal(normalized.firm, 'Tailead');
  assert.equal(normalized.qualification_status, 'PROSPECT_DISCOVERY');
  assert.equal(normalized.primary_service_id, 'API Security Auditing');
  assert.equal(normalized.metrics.supported_match, 30);
  assert.equal(normalized.recommended_action, 'Conduct discovery call to qualify requirements.');
  assert.deepEqual(normalized.intelligence_lineage.map((item) => item.source_id), ['BOOK-001', 'PROS-001']);

  const rendered = renderFinalBrief(artifact);
  assert.match(rendered.brief_markdown, /Company: Test SaaS Co/);
  assert.match(rendered.brief_markdown, /Consultant: Mehdi Medjahed/);
  assert.match(rendered.brief_markdown, /Status: PROSPECT_DISCOVERY/);
  assert.match(rendered.brief_markdown, /Primary service: API Security Auditing/);
  assert.match(rendered.brief_markdown, /Supported Match: 30\/100/);
  assert.match(rendered.brief_markdown, /Conduct discovery call to qualify requirements/);
  assert.match(rendered.brief_markdown, /Confirm technical scope of API audit/);
  assert.match(rendered.brief_markdown, /BOOK-001/);
});

test('fails closed when nested current FINAL contract is missing required metrics/content', () => {
  assert.throws(
    () => renderFinalBrief({
      claris_final_brief: {
        brief_metadata: { report_status: 'QUALIFIED_FOR_DISCOVERY' }
      }
    }),
    /FINAL_ARTIFACT_CONTRACT_MISMATCH/
  );
});

test('fails closed on structurally valid but unrecognized artifact', () => {
  assert.throws(
    () => renderFinalBrief({ unrelated: 'value' }),
    /FINAL_ARTIFACT_UNRECOGNIZED/
  );
});
