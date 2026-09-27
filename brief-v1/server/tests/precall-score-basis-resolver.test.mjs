import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePrecallScoreBasis } from '../precall-score-basis-resolver.mjs';

const prepare={
  open_dimensions:[{dimension_id:'D1'}],
  expandable_blocks:{
    evidence:[{id:'E1'}],
    reasoning:[{id:'R1'}],
    unknowns:[{id:'U1'}]
  }
};
const discovery={
  authorized_dimensions:[{dimension_id:'D1'}],
  primary_questions:[{question_id:'Q1',dimension_id:'D1'}]
};
const sot={services:[{service_id:'S1'}],commercial_rules:{budget_required_before_first_call:false}};
const research={findings:[{evidence_id:'PE-001'}]};
const basis={
  gate_status:'PASS',
  canonical_match_classifications:{
    service_need_alignment:{status:'PARTIAL_MATCH',basis_ids:['BOOKING TRUTH','SOT:services'],reason:'Relevant but unresolved.'},
    icp_company_fit:{status:'UNKNOWN',basis_ids:[],reason:'No ICP policy.'},
    business_trigger:{status:'UNKNOWN',basis_ids:[],reason:'No trigger.'},
    buyer_stakeholder_fit:{status:'UNKNOWN',basis_ids:[],reason:'No buyer evidence.'},
    engagement_economics:{status:'UNKNOWN',basis_ids:[],reason:'No budget evidence.'},
    timing_urgency:{status:'UNKNOWN',basis_ids:[],reason:'No timing evidence.'},
    expansion_potential:{status:'UNKNOWN',basis_ids:[],reason:'No expansion evidence.'}
  },
  canonical_completeness_classifications:{
    critical_question_coverage:{status:'COMPLETE',basis_ids:['D1'],reason:'Covered.'},
    source_authority:{status:'COMPLETE',basis_ids:['PE-001'],reason:'First party.'},
    corroboration_depth:{status:'COMPLETE',basis_ids:['PE-001'],reason:'Sufficient.'},
    freshness:{status:'MISSING',basis_ids:[],reason:'No dates.'},
    conflict_ambiguity_control:{status:'COMPLETE',basis_ids:['R1'],reason:'Bounded.'}
  },
  corrected_strategy:{recommended_action:'Run discovery.'},
  basis_resolution:{all_scored_basis_resolvable:true,unresolved_basis_ids:[]}
};

test('canonicalizes booking alias and normalizes completeness provenance deterministically',()=>{
  const r=resolvePrecallScoreBasis({score_basis:basis,consultant_sot:sot,research_evidence:research,prepare,discovery});
  assert.deepEqual(r.canonical_match_classifications.service_need_alignment.basis_ids,['BOOK-001','SOT:services']);
  assert.deepEqual(r.canonical_completeness_classifications.critical_question_coverage.basis_ids,['DIM:D1','Q:Q1']);
  assert.deepEqual(r.canonical_completeness_classifications.source_authority.basis_ids,['PE-001']);
  assert.deepEqual(r.canonical_completeness_classifications.conflict_ambiguity_control.basis_ids,['R1','U1']);
  assert.deepEqual(r.basis_resolution,{all_scored_basis_resolvable:true,unresolved_basis_ids:[]});
});

test('fails closed on invented fit basis',()=>{
  const broken=structuredClone(basis);
  broken.canonical_match_classifications.business_trigger={status:'MATCH',basis_ids:['PE-001'],reason:'Invented public trigger.'};
  assert.throws(
    ()=>resolvePrecallScoreBasis({score_basis:broken,consultant_sot:sot,research_evidence:research,prepare,discovery}),
    /SCORE_BASIS_COMPOSITION:business_trigger:BOOK-001/
  );
});

test('fails closed on noncanonical unresolved fit id',()=>{
  const broken=structuredClone(basis);
  broken.canonical_match_classifications.service_need_alignment.basis_ids=['SOMETHING_ELSE','SOT:services'];
  assert.throws(
    ()=>resolvePrecallScoreBasis({score_basis:broken,consultant_sot:sot,research_evidence:research,prepare,discovery}),
    /SCORE_BASIS_UNRESOLVED/
  );
});


test('rejects economics classification without direct booking economics',()=>{
  const broken=structuredClone(basis);
  broken.canonical_match_classifications.engagement_economics={
    status:'MATCH',basis_ids:['BOOK-001'],reason:'Budget looks aligned.'
  };
  assert.throws(
    ()=>resolvePrecallScoreBasis({
      score_basis:broken,
      booking_text:'Interested in discussing API security.',
      consultant_sot:sot,
      research_evidence:research,
      prepare,
      discovery
    }),
    /DIRECT_EVIDENCE_REQUIRED:engagement_economics/
  );
});

test('rejects timing classification without direct booking timing',()=>{
  const broken=structuredClone(basis);
  broken.canonical_match_classifications.timing_urgency={
    status:'PARTIAL_MATCH',basis_ids:['BOOK-001'],reason:'Timing inferred.'
  };
  assert.throws(
    ()=>resolvePrecallScoreBasis({
      score_basis:broken,
      booking_text:'Interested in discussing API security.',
      consultant_sot:sot,
      research_evidence:research,
      prepare,
      discovery
    }),
    /DIRECT_EVIDENCE_REQUIRED:timing_urgency/
  );
});

test('rejects stakeholder classification without direct role or ownership language',()=>{
  const broken=structuredClone(basis);
  broken.canonical_match_classifications.buyer_stakeholder_fit={
    status:'MATCH',basis_ids:['BOOK-001'],reason:'Buyer inferred.'
  };
  assert.throws(
    ()=>resolvePrecallScoreBasis({
      score_basis:broken,
      booking_text:'Interested in discussing API security.',
      consultant_sot:sot,
      research_evidence:research,
      prepare,
      discovery
    }),
    /DIRECT_EVIDENCE_REQUIRED:buyer_stakeholder_fit/
  );
});

test('rejects scored freshness when research carries no freshness metadata',()=>{
  const broken=structuredClone(basis);
  broken.canonical_completeness_classifications.freshness={
    status:'COMPLETE',basis_ids:['PE-001'],reason:'Looks current.'
  };
  assert.throws(
    ()=>resolvePrecallScoreBasis({
      score_basis:broken,
      booking_text:'Interested in discussing API security.',
      consultant_sot:sot,
      research_evidence:research,
      prepare,
      discovery
    }),
    /FRESHNESS_EVIDENCE_REQUIRED:freshness/
  );
});

test('accepts objective dimensions only when direct booking signals exist',()=>{
  const enriched=structuredClone(basis);
  enriched.canonical_match_classifications.buyer_stakeholder_fit={
    status:'MATCH',basis_ids:['BOOK-001'],reason:'VP owns evaluation.'
  };
  enriched.canonical_match_classifications.engagement_economics={
    status:'PARTIAL_MATCH',basis_ids:['BOOK-001'],reason:'Budget stated.'
  };
  enriched.canonical_match_classifications.timing_urgency={
    status:'MATCH',basis_ids:['BOOK-001'],reason:'Rollout this quarter.'
  };
  const out=resolvePrecallScoreBasis({
    score_basis:enriched,
    booking_text:"I'm VP Engineering and own the evaluation. Budget is $20k. Rollout is this quarter.",
    consultant_sot:sot,
    research_evidence:research,
    prepare,
    discovery
  });
  assert.equal(out.canonical_match_classifications.buyer_stakeholder_fit.status,'MATCH');
  assert.equal(out.canonical_match_classifications.engagement_economics.status,'PARTIAL_MATCH');
  assert.equal(out.canonical_match_classifications.timing_urgency.status,'MATCH');
});
