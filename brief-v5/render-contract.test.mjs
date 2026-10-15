import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {projectFinalReplay,scoreToLetter} from './replay-adapter.mjs';

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

test('restored A–D rubric uses exact score bands without certifying provider results',()=>{
  for(const [value,want] of [[0,'D'],[24.99,'D'],[25,'C'],[49.99,'C'],
    [50,'B'],[74.99,'B'],[75,'A'],[80,'A'],[100,'A'],
    [null,null],[-1,null],[101,null]])assert.equal(scoreToLetter(value),want);
  const score=project().payload.scorecard;
  assert.equal(score.lead_fit.supported_match,80);
  assert.equal(score.lead_fit.provisional_grade,'A');
  assert.equal(score.lead_fit.grade,null,'certified grade remains absent');
  assert.equal(score.evidence_coverage.score,100);
  assert.equal(score.evidence_coverage.provisional_grade,'A');
  assert.equal(score.evidence_coverage.validation_status,'NOT_INDEPENDENTLY_VERIFIED');
});
test('rendered gauges display the provisional letter with the exact provider score and review hold',()=>{
  const b=project();
  b.payload.commercial_depth={status:'HOLD_FOR_COMMERCIAL_REVIEW',
    missing:['buyer_assurance_deliverable_fork']};
  const html=render(b);
  assert.equal((html.match(/class="gauge-display" x="90" y="81" text-anchor="middle">A<\/text>/g)||[]).length,2);
  assert.match(html,/80\/100 · 85\/100 scorable/);
  assert.match(html,/100\/100 · not verified/);
  assert.match(html,/Commercial review required/);
  assert.match(html,/A–D rubric · provider metric, not verified/);
});
test('critical blindspots distinguish actual unknowns, partials and reviewer-proposed buyer fork',()=>{
  const b=project();
  b.payload.final_replay_v3.match_score_explanation.buyer_stakeholder_fit={
    status:'PARTIAL_MATCH',reasoning:'Technical sign-off role known; actual approver not identified.',
    basis_ids:['BOOK-001']};
  b.payload.final_replay_v3.match_score_explanation.expansion_potential={
    status:'UNKNOWN',reasoning:'No evidence of expansion intent.',basis_ids:[]};
  const projected=projectFinalReplay(b,{evidenceRegistry:research});
  projected.payload.commercial_depth={
    status:'HOLD_FOR_COMMERCIAL_REVIEW',
    buyer_deliverable_fork:{
      open:true,reviewer_question:{
        question:'What specific assurance deliverable will unblock this buyer?',
        rationale:'Current buyer acceptance criteria have not been verified.',
        basis_ids:['BOOK-001']
      }
    }
  };
  const html=render(projected);
  const i=html.indexOf('Critical blindspots');
  const j=html.indexOf('Run the call',i);
  const section=html.slice(i,j);
  assert.match(section,/Buyer-required assurance deliverable/);
  assert.match(section,/Reviewer-identified gap/);
  assert.match(section,/What specific assurance deliverable will unblock this buyer/);
  assert.match(section,/not a FINALIZE question/);
  assert.match(section,/Engagement Economics/);
  assert.match(section,/Not established/);
  assert.match(section,/Buyer Stakeholder Fit/);
  assert.match(section,/Partially established/);
  assert.match(section,/Other unconfirmed dimensions · 1/);
  assert.match(section,/Expansion Potential/);
  assert.doesNotMatch(section,/Resolved by Q1/);
});
test('blindspot section does not create an empty panel when no open statuses exist',()=>{
  const b=project();
  b.payload.final_replay_v3.match_score_explanation={
    service_need_alignment:{status:'MATCH',reasoning:'Evidence-based scope.',basis_ids:['BOOK-001']}};
  const html=render(projectFinalReplay(b,{evidenceRegistry:research}));
  assert.doesNotMatch(html,/class="blindspots panel"/);
});

test('evidence score drawer explains why provider A/100 is held despite consistent arithmetic',()=>{
  const brief=project();
  brief.payload.evidence_score_review={
    assurance:'SEMANTIC_REVIEW_REQUIRED',mathematically_consistent:true,review_required:true,
    provider_score:100,independent_quality_score:null,independent_grade:null,
    warnings:[
      {code:'FULL_CRITICAL_COVERAGE_WITH_OPEN_BUYER_DECISION',
        category:'critical_question_coverage',
        explanation:'35/35 granted although the buyer-required assurance deliverable remains unresolved.'},
      {code:'FULL_AMBIGUITY_CONTROL_WITH_OPEN_DECISION',
        category:'conflict_ambiguity_control',
        explanation:'Absence of conflicts does not resolve open buyer requirements.'}
    ]
  };
  const html=render(brief);
  assert.match(html,/Provider A · independent evidence review required/);
  assert.match(html,/100\/100 · review required/);
  const code=source.slice(0,entry)+"\nscoreDetail('evidence',globalThis.__score,globalThis.__review);";
  const result=vm.runInNewContext(code,{
    document:{getElementById:()=>({})},URL,URLSearchParams,Date,Math,Number,Set,Map,
    String,Boolean,Intl,Array,RegExp,JSON,Error,
    __score:brief.payload.scorecard,__review:brief.payload.evidence_score_review
  },{timeout:2500});
  assert.match(result.body,/five weighted completeness categories/);
  assert.match(result.body,/Why this provider grade is under review/);
  assert.match(result.body,/buyer-required assurance deliverable remains unresolved/);
  assert.match(result.body,/Absence of conflicts does not resolve open buyer requirements/);
});
