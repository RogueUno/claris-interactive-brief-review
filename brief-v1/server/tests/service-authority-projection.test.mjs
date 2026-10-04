import test from 'node:test';
import assert from 'node:assert/strict';
import { projectServiceAuthority } from '../service-authority-projection.mjs';

const sot={services:[
  {service_id:'SVC_ADVISORY',name:'Advisory vCISO'},
  {service_id:'SVC_PENTEST',name:'Penetration Testing'}
]};
const prepare={
  schema_version:'CLARIS_PREMIUM_PREPARE_V3_6',
  conditional_service_paths:[
    {service_id:'SVC_ADVISORY',condition_to_confirm:'Architecture guidance is confirmed.',why_relevant_if_confirmed:'Matches advisory work.',do_not_assume:'Do not assume advisory.'}
  ]
};
const discovery={
  schema_version:'CLARIS_DISCOVERY_INTELLIGENCE_V1_2',
  primary_questions:[{
    question_id:'Q1',
    linked_service_paths:[{service_id:'SVC_PENTEST',condition:'Hands-on validation is confirmed.'}]
  }]
};
const scorecard={
  schema_version:'CLARIS_PRECALL_SCORECARD_V1',
  strategy:{
    recommended_action:'Run discovery before proposing a service.',
    primary_service_id:'SVC_ADVISORY',
    qualification_status:'PROMISING',
    rationale:'Reason.'
  }
};

test('demotes thin-SOT service mappings to hypothesis-only presentation paths',()=>{
  const out=projectServiceAuthority({prepare,discovery,scorecard,consultant_sot:sot});
  assert.equal('conditional_service_paths' in out.prepare,false);
  assert.equal(out.prepare.possible_service_paths[0].service_name,'Advisory vCISO');
  assert.equal(out.prepare.possible_service_paths[0].authority,'HYPOTHESIS_ONLY');
  assert.equal('linked_service_paths' in out.discovery.primary_questions[0],false);
  assert.equal(out.discovery.primary_questions[0].possible_service_paths[0].service_name,'Penetration Testing');
  assert.equal(out.discovery.primary_questions[0].possible_service_paths[0].display_label,'Possible path if confirmed');
  assert.equal(out.scorecard.strategy.primary_service_id,null);
  assert.equal(out.scorecard.strategy.service_authority.suppressed_primary_service_id,'SVC_ADVISORY');
});

test('removes recommended action when it directly names a service without scope authority',()=>{
  const out=projectServiceAuthority({
    prepare,
    discovery,
    scorecard:{...scorecard,strategy:{...scorecard.strategy,recommended_action:'Recommend Advisory vCISO now.'}},
    consultant_sot:sot
  });
  assert.equal(out.scorecard.strategy.recommended_action,null);
});

test('does not mutate certified source artifacts',()=>{
  const p=structuredClone(prepare),d=structuredClone(discovery),s=structuredClone(scorecard);
  projectServiceAuthority({prepare:p,discovery:d,scorecard:s,consultant_sot:sot});
  assert.ok(prepare.conditional_service_paths);
  assert.ok(discovery.primary_questions[0].linked_service_paths);
  assert.equal(scorecard.strategy.primary_service_id,'SVC_ADVISORY');
});
