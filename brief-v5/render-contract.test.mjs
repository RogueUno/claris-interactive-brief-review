import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {projectFinalReplay} from './replay-adapter.mjs';

const booking='A buyer asks for assurance evidence and EU infrastructure scope.';
const raw={
  match_score_explanation:{
    service_need_alignment:{status:'MATCH',reasoning:'Buyer needs evidence review for SOC 2.',basis_ids:['BOOK-001','PROS-001-A']},
    business_trigger:{status:'MATCH',reasoning:'Buyer has paused an annual contract.',basis_ids:['BOOK-001']},
    engagement_economics:{status:'UNKNOWN',reasoning:'No budget approved.',basis_ids:[]}
  },
  question_plan:[
    {question_id:'q_budget',text:'Who approves the consulting budget?',rationale:'Budget not approved.'},
    {question_id:'q_eu',text:'Does the SOC 2 report cover EU hosting?',rationale:'EU scope remains unverified.'},
    {question_id:'q_signoff',text:'Who signs off on the security questionnaire?',rationale:'Decision owner unclear.'}
  ],
  preliminary_brief_markdown:'### Strategic Overview\nA buyer has paused procurement while seeking assurance evidence.',
  engagement_metadata:{deterministic_metrics:{supported_match:80,scorable_coverage:85,evidence_completeness:100}},
  completeness_score_explanation:{
    critical_question_coverage:{status:'COMPLETE',reasoning:'Provider judged question coverage complete.',score:35}
  },
  intelligence_lineage:[
    {insight:'Contract pending assurance',evidence_ids:['BOOK-001','PROS-001-A']},
    {insight:'API documentation available',evidence_ids:['FAC-001']}
  ]
};
const research=[
  {evidence_id:'FAC-001',admission_status:'ADMITTED',sensitivity:'STANDARD',source_url:'https://posthog.com/docs',
    authority:'VERIFIED_PUBLIC_FACT',source_title:'PostHog documentation',source_excerpt:'Product analytics and EU hosting.'},
  {evidence_id:'FAC-003',admission_status:'ADMITTED',sensitivity:'STANDARD',source_url:'https://example.com/company',
    authority:'THIRD_PARTY_REPORTED',source_title:'Company directory',
    source_excerpt:'The firm was founded in 2020, based in San Francisco, and employs 51-200 employees.'}
];
const source=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
const entry=source.lastIndexOf('\nboot().catch');
assert.ok(entry>0,'renderer bootstrap boundary must remain stable');
function render(brief){
  const root={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null,classList:{add(){}},dataset:{}};
  const sandbox={document:{getElementById:()=>root},window:{matchMedia:()=>({matches:true})},
    URL,URLSearchParams,Date,Math,Number,String,Set,Map,Boolean,Intl,Array,RegExp,JSON,Error,
    CSS:{escape:x=>x},setInterval:()=>null};
  vm.runInNewContext(source.slice(0,entry)+'\nrender(globalThis.__brief);', {...sandbox,__brief:brief}, {timeout:2500});
  return root.innerHTML;
}
const project=()=>projectFinalReplay({
  company:'PostHog',expires_at:'2026-10-20T18:00:00.000Z',
  context:{booking_text:booking,prospect_name:'Avery (fictional)',prospect_role:'Coordinator',
    meeting_time:null,simulation_note:'No Calendly event'},
  payload:{final_replay_v3:structuredClone(raw)}
},{evidenceRegistry:research});

test('provider question purpose is never attached by array index or invented dimensions',()=>{
  const brief=project();
  const q=brief.payload.discovery.primary_questions;
  assert.equal(q.length,3);
  assert.ok(q.every(x=>x.dimension_id===null));
  assert.deepEqual(q.map(x=>x.ask),raw.question_plan.map(x=>x.text));
  assert.equal(brief.payload.discovery.call_flow[0].label,raw.question_plan[0].text);
  assert.equal(brief.payload.discovery.call_flow[1].label,raw.question_plan[1].text);
  assert.equal(JSON.stringify(brief).includes('Use Q1 to resolve assurance scope'),false);
  assert.equal(brief.payload.prepare.signals_that_matter[0].observation,'Buyer needs evidence review for SOC 2.');
});
test('real rendered call path keeps 3 purposes, avoids empty listening panes and fake next move',()=>{
  const brief=project();
  brief.payload.commercial_depth={status:'HOLD_FOR_COMMERCIAL_REVIEW',
    missing:['recommended_action','buyer_assurance_deliverable_fork']};
  const html=render(brief);
  assert.equal((html.match(/class="call-phase question-phase"/g)||[]).length,3);
  assert.match(html,/Who approves the consulting budget/);
  assert.match(html,/Does the SOC 2 report cover EU hosting/);
  assert.doesNotMatch(html,/Resolves · Buyer requirement and systems in scope/);
  assert.doesNotMatch(html,/Listen for<\/span><ul class="listen-list"><\/ul>/);
  assert.doesNotMatch(html,/Advanced branches & answer effects/);
  assert.match(html,/No provider-supported next action is established/);
  assert.doesNotMatch(html,/Advance if<\/h4><ul><\/ul>/);
  assert.match(html,/Commercial review required/);
});
test('assessment and hypothesis are not described as verified Fact',()=>{
  const html=render(project());
  assert.match(html,/Provider assessment/);
  assert.doesNotMatch(html,/truth-badge fact/);
  assert.match(html,/Buyer needs evidence review for SOC 2/);
  assert.match(html,/Basis: BOOK-001 · PROS-001-A/);
});
test('partial company snapshot remains visible with cited reported demographics',()=>{
  const brief=project();
  assert.ok(brief.payload.company_snapshot);
  const html=render(brief);
  assert.match(html,/Company snapshot/);
  assert.match(html,/2020 \(reported\)/);
  assert.match(html,/Source-reported profile/);
  assert.doesNotMatch(html,/Meeting time not attached/);
  assert.match(html,/No verified Calendly meeting time/);
});
test('sparse or empty provider material never produces phantom questions or a certified grade',()=>{
  const b=project();
  b.payload.final_replay_v3.question_plan=[];
  b.payload.final_replay_v3.match_score_explanation={};
  const res=projectFinalReplay(b,{evidenceRegistry:[]});
  assert.equal(res.payload.discovery.primary_questions.length,0);
  assert.equal(res.payload.prepare.signals_that_matter.length,0);
  assert.equal(res.payload.scorecard.lead_fit.grade,null);
  assert.equal(res.payload.company_snapshot,undefined);
  assert.doesNotMatch(render(res),/Provider assessment<\/span>/);
});
