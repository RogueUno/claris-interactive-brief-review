import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFinalReplay } from './replay-adapter.mjs';

const artifact={
  match_classifications:{
    service_need_alignment:{status:'MATCH',basis_ids:['PROS-001'],reason:'Prospect selected readiness'},
    icp_company_fit:{status:'MATCH',basis_ids:['FAC-002'],reason:'Software development platform'},
    timing_urgency:{status:'UNKNOWN',basis_ids:[],reason:'No confirmed deadline'},
    buyer_stakeholder_fit:{status:'UNKNOWN',basis_ids:[],reason:'Decision owner not known'}
  },
  prospect_question_plan:[
    {question_id:'scope',text:'What exactly is the buyer asking for?',strategy_alignment:'Scope'},
    {question_id:'owner',text:'Who owns this decision?',strategy_alignment:'Authority'}
  ],
  potential_service_relevance:[{service_id:'SVC_SOC2'}],
  deterministic_metrics:{supported_match:'50/100',scorable_coverage:'50/100',evidence_completeness:'74.75/100'},
  preliminary_brief_markdown:'### Executive Summary\nA bounded SOC 2 diagnosis.\n\n### Strategic Guidance\nDo not assume.',
  intelligence_lineage:[{evidence_id:'FAC-002',source:'Third-party listing',description:'Software company'}]
};
const records=[
  {evidence_id:'FAC-002',admission_status:'ADMITTED',sensitivity:'STANDARD',
    source_url:'https://leadiq.com/c/posthog',source_title:'PostHog company listing',
    authority:'THIRD_PARTY_REPORTED',source_excerpt:'A software development company with 51-200 employees, SOC2 certified.'},
  {evidence_id:'FAC-003',admission_status:'ADMITTED',sensitivity:'STANDARD',
    source_url:'https://www.cbinsights.com/company/posthog',source_title:'PostHog description',
    authority:'THIRD_PARTY_REPORTED',source_excerpt:'It was founded in 2020 and is based in San Francisco, California.'},
  {evidence_id:'FAC-004',admission_status:'ADMITTED',sensitivity:'STANDARD',
    source_url:'https://posthog.com/docs/api/oauth',source_title:'OAuth integration docs',
    authority:'VERIFIED_PUBLIC_FACT',source_excerpt:'PostHog OAuth app scopes and API documentation.'},
  {evidence_id:'FAC-007',admission_status:'ADMITTED',sensitivity:'SENSITIVE_CONSULTANT_ONLY',
    source_url:'https://example.com/incident',source_title:'Historical security event',
    authority:'THIRD_PARTY_REPORTED',source_excerpt:'Unrelated historical event.'},
  {evidence_id:'FAC-008',admission_status:'REJECTED',sensitivity:'STANDARD',
    source_url:'https://example.com/fabricated',source_title:'Rejected claim',
    authority:'THIRD_PARTY_REPORTED',source_excerpt:'Rejected by research truth boundary.'},
  {evidence_id:'FAC-009',admission_status:'ADMITTED',sensitivity:'STANDARD',
    source_url:'javascript:alert(1)',source_title:'Unsafe source URL',
    authority:'THIRD_PARTY_REPORTED',source_excerpt:'Unsafe source.'}
];
function base(){return {company:'PostHog',context:{booking_text:'Buyer wants assurance'},payload:{final_replay_v3:artifact}};}

test('only admitted, standard, https sources are visible; source URLs preserved and provenance labeled',()=>{
 const result=projectFinalReplay(base(),{evidenceRegistry:records});
 const evidence=result.payload.prepare.expandable_blocks.evidence;
 assert.equal(evidence.length,3);
 assert.deepEqual(evidence.map(e=>e.sources[0].url),
  ['https://leadiq.com/c/posthog','https://www.cbinsights.com/company/posthog','https://posthog.com/docs/api/oauth']);
 assert.ok(evidence[0].claims.some(x=>x.includes('Source excerpt (not independently verified)')));
 assert.ok(evidence.every(x=>x.not_used_for.some(s=>s.includes('buyer intent'))));
 assert.equal(JSON.stringify(evidence).includes('Historical security event'),false);
 assert.equal(JSON.stringify(evidence).includes('Rejected claim'),false);
});
test('SOC 2 posture tension remains a hypothesis and does not create a phantom discovery question',()=>{
 const result=projectFinalReplay(base(),{evidenceRegistry:records});
 assert.match(result.payload.prepare.signals_that_matter[0].signal,/Possible assurance-scope mismatch/);
 assert.match(result.payload.prepare.signals_that_matter[0].observation,/may be stale or inaccurate/);
 assert.equal(result.payload.discovery.primary_questions.length,2);
 assert.equal(result.payload.discovery.primary_questions[0].ask,artifact.prospect_question_plan[0].text);
 assert.equal(result.payload.scorecard.lead_fit.grade,null);
 assert.equal(result.payload.scorecard.call_readiness.status,'OPEN');
 assert.equal(result.payload.replay_assessment.evidence_completeness,74.75);
});
test('third-party-reported company snapshot remains visibly qualified',()=>{
 const snap=projectFinalReplay(base(),{evidenceRegistry:records}).payload.company_snapshot;
 assert.equal(snap.authority,'PRESENTATION_ONLY');
 assert.equal(snap.fields.founded_year.display,'2020 (reported)');
 assert.match(snap.fields.employee_size.display,/reported/);
 assert.match(snap.fields.headquarters.source_label,/not independently verified/);
 assert.equal(snap.fields.company_type.supported,true);
});
test('no evidence means no fabricated snapshot or tension, and original data remains unchanged',()=>{
 const input=base(),before=JSON.stringify(input);
 const result=projectFinalReplay(input);
 assert.equal(result.payload.company_snapshot,undefined);
 assert.equal(result.payload.prepare.expandable_blocks.evidence.length,0);
 assert.equal(result.payload.prepare.signals_that_matter.some(x=>x.signal.includes('mismatch')),false);
 assert.equal(JSON.stringify(input),before);
});

test('provider strategic narrative and qualified hypothesis survive without sensitive source promotion',()=>{
  const input=base();
  input.payload.final_replay_v3=structuredClone(artifact);
  input.payload.final_replay_v3.preliminary_brief_markdown=[
    '### Executive Summary','Bounded diagnosis.',
    '### Strategic Guidance',
    '- **Talking Point:** Review official OAuth architecture (FAC-004).',
    '- Confirm buyer acceptance criteria without assuming evidence is sufficient.',
    '### Critical Context',
    '- Third-party listing suggests an existing compliance posture (FAC-002).',
    '- An unrelated historical signal FAC-007 must not be taken as current weakness.'
  ].join('\n');
  input.payload.final_replay_v3.consultant_only_context={hypotheses:[
    {description:'OAuth/API dependencies may shape scoping, but this is unverified.',
     basis_ids:['FAC-004','FAC-007']}
  ]};
  const projected=projectFinalReplay(input,{evidenceRegistry:records});
  const reasoning=projected.payload.prepare.expandable_blocks.reasoning;
  const guidance=reasoning.find(x=>x.title.includes('Strategic Guidance'));
  assert.ok(guidance);
  assert.match(guidance.observation,/Review official OAuth architecture/);
  assert.deepEqual(guidance.premises,['FAC-004']);
  const critical=reasoning.find(x=>x.title.includes('Critical Context'));
  assert.ok(critical);
  assert.deepEqual(critical.premises,['FAC-002']);
  assert.doesNotMatch(critical.observation,/FAC-007/,'sensitive historical source must be excluded from presentation');
  assert.equal(projected.payload.replay_evidence.some(x=>x.id==='FAC-007'),false);
  const hypothesis=reasoning.find(x=>x.title.includes('Consultant-only hypothesis'));
  assert.deepEqual(hypothesis.premises,['FAC-004'],'sensitive source FAC-007 must not be elevated');
  assert.ok(hypothesis.not_a_claim_of.includes('A current security weakness'));
  assert.equal(projected.payload.discovery.primary_questions.length,2);
});
