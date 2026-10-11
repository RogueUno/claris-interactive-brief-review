import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prioritizeDiscoveryQuestions } from '../discovery-prioritizer.mjs';
import { assessCommercialBrief } from '../commercial-brief-readiness.mjs';
import { normalizeFinalArtifact } from '../final-brief-renderer.mjs';

const load = name => JSON.parse(readFileSync(new URL('./fixtures/' + name, import.meta.url),'utf8'));
const fictional=load('fictional-soc2-advisory-final.json');
const oct10=load('oct10-finalize-live-actual.json');
const oct09=load('oct09-finalize-actual.json');

test('commercial SOC2 case prioritizes exactly five supplied questions with six-topic coverage',()=>{
  const actual=normalizeFinalArtifact(fictional).discovery_questions;
  const r=prioritizeDiscoveryQuestions(fictional);
  assert.equal(r.status,'PRIORITIZED_FOR_REVIEW');
  assert.equal(r.source_question_count,5);
  assert.equal(r.selected_count,5);
  assert.deepEqual(r.missing_topics,[]);
  assert.deepEqual(new Set(r.selected.map(q=>q.original_index)).size,5);
  for(const q of r.selected) {
    assert.equal(q.origin,'FINALIZE_QUESTION_PLAN');
    assert.equal(q.question,actual[q.original_index-1].question);
    assert.ok(q.topics.length>0);
  }
  assert.deepEqual(r.unresolved_dimensions.map(x=>x.dimension).sort(), ['buyer_stakeholder_fit','business_trigger','engagement_economics']);
  assert.equal(assessCommercialBrief(fictional).prioritized_discovery.selected_count,5);
});

test('October 10 real rehearsal never receives invented budget or urgency questions',()=>{
  const r=prioritizeDiscoveryQuestions(oct10);
  assert.equal(r.source_question_count,1);
  assert.equal(r.selected_count,1);
  assert.equal(r.status,'INSUFFICIENT_GROUNDED_QUESTIONS');
  assert.equal(r.selected[0].question,oct10.prospect_question_plan[0].question);
  assert.ok(!r.selected[0].question.toLowerCase().includes('budget'));
  assert.ok(r.missing_topics.includes('commercial_feasibility'));
  assert.ok(r.unresolved_dimensions.some(x=>x.dimension==='engagement_economics'));
  assert.equal(assessCommercialBrief(oct10,{synthetic:true}).status,'NOT_COMMERCIAL_BENCHMARK');
});

test('October 9 real rehearsal preserves its only generated question and scope restrictions',()=>{
  const r=prioritizeDiscoveryQuestions(oct09);
  assert.equal(r.source_question_count,1);
  assert.equal(r.selected_count,1);
  assert.equal(r.status,'INSUFFICIENT_GROUNDED_QUESTIONS');
  assert.equal(r.selected[0].question,oct09.prospect_question_plan[0].question);
});

test('generic padded questions are not selected or made to look complete',()=>{
  const r=prioritizeDiscoveryQuestions({discovery_question_plan:[
    'Tell me about your company?', 'What matters to you?',
    'What is next?', 'Any other priorities?', 'How can we help?'
  ]});
  assert.equal(r.status,'INSUFFICIENT_GROUNDED_QUESTIONS');
  assert.equal(r.selected_count,0);
  assert.equal(r.uncategorized_skipped,5);
});

test('repeated question cannot crowd out other priorities',()=>{
  const q='Who will approve the proposed engagement?';
  const r=prioritizeDiscoveryQuestions({discovery_question_plan:[
    q,q,q,'What is the budget for this project?',
    'Which products and infrastructure are in scope?'
  ]});
  assert.equal(r.duplicates_skipped,2);
  assert.equal(r.selected_count,3);
  assert.equal(r.selected.filter(x=>x.question===q).length,1);
});

test('unverified references never enter selected evidence list',()=>{
  const data={
    match_classifications:{engagement_economics:{status:'UNKNOWN',basis_ids:['UNADMITTED-1']}},
    intelligence_lineage:[{source_id:'BOOK-001',authority:'BOOKING_TEXT'}],
    discovery_question_plan:[{question:'Is there a budget approved for the engagement?',intent:'Commercial qualification'}]
  };
  const r=prioritizeDiscoveryQuestions(data);
  assert.equal(r.selected_count,1);
  assert.deepEqual(r.selected[0].declared_evidence_refs,[]);
  assert.deepEqual(r.unresolved_dimensions[0].declared_evidence_refs,[]);
  assert.equal(r.selected[0].unresolved_dimensions[0].status,'UNKNOWN');
});
