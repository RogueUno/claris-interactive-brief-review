import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compilePrecallScorecard } from '../precall-scorecard.mjs';
import { compileCertifiedBriefPublication } from '../certified-publication-adapter.mjs';
import { resolvePrecallScoreBasis } from '../precall-score-basis-resolver.mjs';
import { projectServiceAuthority } from '../service-authority-projection.mjs';

const certification={
  schema_version:'CLARIS_PRECALL_CERTIFICATION_V1',
  premium_semantic_pass:true,
  discovery_semantic_pass:true,
  premium_deterministic_pass:true,
  discovery_deterministic_pass:true
};

const fixtures=[
  {dir:'supabase-v1',company:'Supabase',expected:{grade:'A',coverage:65,evidence:85}},
  {dir:'resend-v3',company:'Resend',expected:{grade:null,coverage:0,evidence:85}},
  {dir:'linear-v1',company:'Linear',expected:{grade:'A',coverage:45,evidence:85}}
];

for(const fixture of fixtures){
  test(`${fixture.company} live pre-call score basis compiles deterministically and publishes minimized`,()=>{
    const base=new URL(`../../../reference/premium-gauntlet/fixtures/${fixture.dir}/`,import.meta.url);
    const booking=fs.readFileSync(new URL('booking.txt',base),'utf8').trim();
    const sot=JSON.parse(fs.readFileSync(new URL('consultant-sot.json',base),'utf8'));
    const prepare=JSON.parse(fs.readFileSync(new URL('premium-prepare.json',base),'utf8'));
    const discovery=JSON.parse(fs.readFileSync(new URL('discovery-plan.json',base),'utf8'));
    const basis=JSON.parse(fs.readFileSync(new URL('precall-score-basis.json',base),'utf8'));
    const research={
      schema_version:'CLARIS_PREMIUM_EVIDENCE_V1',
      company:fixture.company,
      booking_truth:booking,
      findings:(prepare.expandable_blocks?.evidence||[]).map((e,i)=>({
        evidence_id:`PE-${String(i+1).padStart(3,'0')}`,
        category:'FIRST_PARTY',
        fact:e.claims?.[0]||'',
        source_url:e.sources?.[0]?.url||'',
        source_type:e.sources?.[0]?.source_type||'FIRST_PARTY'
      }))
    };

    const resolvedBasis=resolvePrecallScoreBasis({
      score_basis:basis,
      booking_text:booking,
      consultant_sot:sot,
      research_evidence:research,
      prepare,
      discovery
    });
    const scorecard=compilePrecallScorecard({score_basis:resolvedBasis,prepare,discovery,certification});
    assert.equal(scorecard.lead_fit.grade,fixture.expected.grade);
    assert.equal(scorecard.lead_fit.scorable_coverage,fixture.expected.coverage);
    assert.equal('evaluated_fit_rate' in scorecard.lead_fit,false);
    assert.equal('supported_match' in scorecard.lead_fit,false);
    assert.equal(scorecard.evidence_coverage.score,fixture.expected.evidence);
    assert.equal(scorecard.call_readiness.status,'READY');

    const published=compileCertifiedBriefPublication({
      opportunity_id:`gold_${fixture.dir}_score_v1`,
      consultant_id:'consultant_gold_score_v1',
      consultant_delivery_email:'consultant@example.com',
      consultant_first_name:'Chase',
      company:fixture.company,
      prospect_name:'Fixture prospect',
      meeting_time:'2026-09-30T14:00:00Z',
      booking_text:booking,
      prepare,
      discovery,
      consultant_sot:sot,
      premium_audit:{audit_status:'PASS'},
      discovery_audit:{audit_status:'PASS'},
      premium_validation:{ok:true,errors:[]},
      discovery_validation:{ok:true,errors:[]},
      precall_score_basis:basis,
      precall_research_evidence:research
    });

    assert.equal(published.operation,'brief_publish_ready');
    assert.equal(published.body.booking_text,booking);
    assert.equal(published.body.brief_payload.scorecard.schema_version,'CLARIS_PRECALL_SCORECARD_V1');
    const projected=projectServiceAuthority({prepare,discovery,scorecard,consultant_sot:sot});
    assert.deepEqual(published.body.brief_payload.scorecard,projected.scorecard);
    assert.equal(published.body.brief_payload.scorecard.strategy.primary_service_id,null);
    assert.equal(published.body.brief_payload.discovery.service_authority.mode,'HYPOTHESIS_ONLY');
    for(const q of published.body.brief_payload.discovery.primary_questions){
      assert.equal('linked_service_paths' in q,false);
      assert.ok(Array.isArray(q.possible_service_paths));
    }

    const serialized=JSON.stringify(published.body);
    assert.doesNotMatch(serialized,/canonical_match_classifications/);
    assert.doesNotMatch(serialized,/canonical_completeness_classifications/);
    assert.doesNotMatch(serialized,/basis_resolution/);
    assert.doesNotMatch(serialized,/minimum_viable_engagement_usd/);
  });
}
