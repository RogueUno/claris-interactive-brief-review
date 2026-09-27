import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCertifiedBriefPublication } from '../certified-publication-adapter.mjs';

const prepare={
  schema_version:'CLARIS_PREMIUM_PREPARE_V3_6',
  executive_readout:'Dense readout.',
  open_dimensions:[{dimension_id:'D1',max_questions:1}]
};
const discovery={
  schema_version:'CLARIS_DISCOVERY_INTELLIGENCE_V1_2',
  authorized_dimensions:[{dimension_id:'D1',authority:'PREPARE',policy_key:null}],
  commercial_target:[],
  primary_questions:[{
    question_id:'Q1',
    dimension_id:'D1',
    ask:'Which surface is in scope?',
    linked_service_paths:[{service_id:'SVC_ADVISORY',condition:'Guidance requested.'}],
    conditional_probes:[]
  }],
  end_of_call_decision:{
    ready_for_next_step_if:['Scope clear.'],
    remain_in_discovery_if:['D1 unresolved.'],
    disqualify_or_deprioritize_if:['Outside capabilities.']
  }
};
const sot={
  services:[{service_id:'SVC_ADVISORY',name:'Advisory vCISO'}],
  commercial_rules:{budget_required_before_first_call:false,minimum_viable_engagement_usd:7500}
};
const base={
  opportunity_id:'opp_123',
  consultant_id:'consultant_123',
  consultant_delivery_email:'consultant@example.com',
  consultant_first_name:'Chase',
  company:'Acme',
  prospect_name:'Alex',
  prospect_role:'VP Engineering',
  meeting_time:'2026-09-30T14:00:00Z',
  prepare,
  discovery,
  consultant_sot:sot,
  premium_audit:{audit_status:'PASS'},
  discovery_audit:{audit_status:'PASS'},
  premium_validation:{ok:true,errors:[]},
  discovery_validation:{ok:true,errors:[]}
};

test('certified adapter emits one brief_publish_ready request',()=>{
  const result=compileCertifiedBriefPublication(base);
  assert.equal(result.operation,'brief_publish_ready');
  assert.equal(result.body.opportunity_id,'opp_123');
  assert.equal(result.body.brief_payload.prepare,prepare);
  assert.equal(result.body.brief_payload.discovery,discovery);
  assert.equal(result.body.validation_context.commercial_rules.budget_required_before_first_call,false);
  assert.equal(JSON.stringify(result.body).includes('7500'),false);
  assert.deepEqual(result.body.certification,{
    schema_version:'CLARIS_PRECALL_CERTIFICATION_V1',
    premium_semantic_pass:true,
    discovery_semantic_pass:true,
    premium_deterministic_pass:true,
    discovery_deterministic_pass:true
  });
});

for(const [field,bad,code] of [
  ['premium_audit',{audit_status:'FAIL'},'PREMIUM_AUDIT_PASS_REQUIRED'],
  ['discovery_audit',{audit_status:'FAIL'},'DISCOVERY_AUDIT_PASS_REQUIRED'],
  ['premium_validation',{ok:false},'PREMIUM_VALIDATION_PASS_REQUIRED'],
  ['discovery_validation',{ok:false},'DISCOVERY_VALIDATION_PASS_REQUIRED']
]){
  test(`fails closed when ${field} is not certified`,()=>{
    assert.throws(()=>compileCertifiedBriefPublication({...base,[field]:bad}),new RegExp(code));
  });
}

test('accepts JSON strings from Make outputs without changing authority',()=>{
  const result=compileCertifiedBriefPublication({
    ...base,
    prepare:JSON.stringify(prepare),
    discovery:JSON.stringify(discovery),
    premium_audit:JSON.stringify({audit_status:'PASS'}),
    discovery_audit:JSON.stringify({audit_status:'PASS'}),
    premium_validation:JSON.stringify({ok:true}),
    discovery_validation:JSON.stringify({ok:true})
  });
  assert.equal(result.operation,'brief_publish_ready');
});


test('compiles traceable scorecard while keeping raw scoring basis out of publication body',()=>{
  const basis={
    gate_status:'PASS',
    canonical_match_classifications:{
      service_need_alignment:{status:'MATCH',basis_ids:['BOOK-001','SOT:services'],reason:'Direct requested service fit.'},
      icp_company_fit:{status:'UNKNOWN',basis_ids:[],reason:'No explicit ICP policy is present.'},
      business_trigger:{status:'PARTIAL_MATCH',basis_ids:['BOOK-001'],reason:'Trigger present but depth remains open.'},
      buyer_stakeholder_fit:{status:'UNKNOWN',basis_ids:[],reason:'Buyer fit is not established.'},
      engagement_economics:{status:'UNKNOWN',basis_ids:[],reason:'No authorized economics evidence yet.'},
      timing_urgency:{status:'UNKNOWN',basis_ids:[],reason:'No resolved delivery date yet.'},
      expansion_potential:{status:'UNKNOWN',basis_ids:[],reason:'No distinct second need is established.'}
    },
    canonical_completeness_classifications:{
      critical_question_coverage:{status:'COMPLETE',basis_ids:['E1'],reason:'Critical unknown is mapped.'},
      source_authority:{status:'COMPLETE',basis_ids:['PE-001'],reason:'First-party evidence dominates.'},
      corroboration_depth:{status:'PARTIAL',basis_ids:['PE-002'],reason:'Some claims have one authoritative source.'},
      freshness:{status:'MISSING',basis_ids:[],reason:'No explicit freshness metadata is attached.'},
      conflict_ambiguity_control:{status:'COMPLETE',basis_ids:['PE-003'],reason:'Conflicts are bounded.'}
    },
    basis_resolution:{all_scored_basis_resolvable:true,unresolved_basis_ids:[]}
  };
  const research={findings:[
    {evidence_id:'PE-001'},{evidence_id:'PE-002'},{evidence_id:'PE-003'}
  ]};
  const result=compileCertifiedBriefPublication({
    ...base,
    booking_text:'We need an API security review.',
    precall_score_basis:basis,
    precall_research_evidence:research
  });
  assert.equal(result.body.booking_text,'We need an API security review.');
  assert.equal(result.body.brief_payload.scorecard.schema_version,'CLARIS_PRECALL_SCORECARD_V1');
  assert.equal(result.body.brief_payload.scorecard.lead_fit.grade,'A');
  assert.equal(result.body.brief_payload.scorecard.call_readiness.status,'READY');
  const serialized=JSON.stringify(result.body);
  assert.doesNotMatch(serialized,/canonical_match_classifications/);
  assert.doesNotMatch(serialized,/basis_resolution/);
});


test('score publication fails closed without the research evidence packet used to resolve basis ids',()=>{
  const basis={
    gate_status:'PASS',
    canonical_match_classifications:{
      service_need_alignment:{status:'MATCH',basis_ids:['BOOK-001','SOT:services'],reason:'Direct fit.'},
      icp_company_fit:{status:'UNKNOWN',basis_ids:[],reason:'No ICP policy.'},
      business_trigger:{status:'UNKNOWN',basis_ids:[],reason:'No trigger.'},
      buyer_stakeholder_fit:{status:'UNKNOWN',basis_ids:[],reason:'No buyer evidence.'},
      engagement_economics:{status:'UNKNOWN',basis_ids:[],reason:'No economics.'},
      timing_urgency:{status:'UNKNOWN',basis_ids:[],reason:'No timing.'},
      expansion_potential:{status:'UNKNOWN',basis_ids:[],reason:'No expansion.'}
    },
    canonical_completeness_classifications:{
      critical_question_coverage:{status:'COMPLETE',basis_ids:['E1'],reason:'Covered.'},
      source_authority:{status:'MISSING',basis_ids:[],reason:'No packet.'},
      corroboration_depth:{status:'MISSING',basis_ids:[],reason:'No packet.'},
      freshness:{status:'MISSING',basis_ids:[],reason:'No packet.'},
      conflict_ambiguity_control:{status:'MISSING',basis_ids:[],reason:'No packet.'}
    },
    basis_resolution:{all_scored_basis_resolvable:true,unresolved_basis_ids:[]}
  };
  assert.throws(
    ()=>compileCertifiedBriefPublication({...base,booking_text:'Need help.',precall_score_basis:basis}),
    /PRECALL_RESEARCH_EVIDENCE_REQUIRED/
  );
});
