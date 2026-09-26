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
