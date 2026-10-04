import { evaluatePilotV1 } from './pilot-evaluator-v1.mjs';

const avg=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;

export function aggregatePilotsV1(records=[]){
  if(!Array.isArray(records)||records.length<3){
    return {ok:false,errors:[{code:'THREE_PILOTS_REQUIRED',path:'records',message:'At least three real opportunity records are required.'}]};
  }

  const evaluations=records.map((record,index)=>({index,evaluation:evaluatePilotV1(record)}));
  const invalid=evaluations.filter(x=>!x.evaluation.ok);
  if(invalid.length){
    return {
      ok:false,
      errors:invalid.flatMap(x=>x.evaluation.errors.map(error=>({...error,record_index:x.index})))
    };
  }

  const evals=evaluations.map(x=>x.evaluation);
  const hardFailureRecords=evals.filter(x=>x.hard_failures.length>0);
  const paidCandidates=evals.filter(x=>x.decision.paid_pilot_candidate);
  const strongFourFigure=evals.filter(x=>x.decision.four_figure_value_evidence_strong);
  const reuseCount=evals.filter(x=>x.evidence.would_use_next_serious_call).length;
  const branchingCount=evals.filter(x=>x.evidence.useful_branching_observed).length;

  const summary={
    opportunity_count:evals.length,
    paid_pilot_candidate_count:paidCandidates.length,
    four_figure_value_evidence_strong_count:strongFourFigure.length,
    hard_failure_opportunity_count:hardFailureRecords.length,
    reuse_intent_count:reuseCount,
    useful_branching_opportunity_count:branchingCount,
    average_prep_minutes_saved:avg(evals.map(x=>x.evidence.prep_minutes_saved)),
    average_prep_reduction_ratio:avg(evals.map(x=>x.evidence.prep_reduction_ratio)),
    average_primary_question_helpful_ratio:avg(evals.map(x=>x.evidence.primary_question_helpful_ratio)),
    average_trust_rating:avg(evals.map(x=>x.evidence.trust_rating)),
    average_live_usability_rating:avg(evals.map(x=>x.evidence.live_usability_rating)),
    total_material_facts_not_in_booking:evals.reduce((sum,x)=>sum+x.evidence.material_facts_not_in_booking,0),
    total_redundant_questions_avoided:evals.reduce((sum,x)=>sum+x.evidence.redundant_questions_avoided,0)
  };

  const commercialValidationReady=
    evals.length>=3 &&
    paidCandidates.length>=2 &&
    hardFailureRecords.length===0 &&
    reuseCount>=2 &&
    summary.average_trust_rating>=4 &&
    summary.average_live_usability_rating>=4;

  const fourFigureThesisReadyForBuyerTest=
    commercialValidationReady &&
    strongFourFigure.length>=2 &&
    summary.average_prep_minutes_saved>=20 &&
    summary.average_primary_question_helpful_ratio>=0.7;

  return {
    ok:true,
    schema_version:'CLARIS_PILOT_AGGREGATE_V1',
    evaluations:evals,
    summary,
    decision:{
      commercial_validation_ready:commercialValidationReady,
      four_figure_thesis_ready_for_buyer_test:fourFigureThesisReadyForBuyerTest,
      note:'This gate supports moving to real buyer pricing tests; it does not itself prove willingness to pay.'
    }
  };
}
