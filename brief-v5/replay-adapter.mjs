const list=x=>Array.isArray(x)?x:[];
const str=x=>typeof x==='string'?x.trim():'';
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const title=x=>str(x).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const metric=x=>{const m=String(x??'').match(/^(\d+(?:\.\d+)?)/);return m?Number(m[1]):null;};
function excerpt(md,heading){
  const source=str(md),i=source.indexOf('### '+heading);
  if(i<0)return '';
  return source.slice(i+('### '+heading).length).split(/\n### /,1)[0].trim();
}
export function projectFinalReplay(brief){
  const raw=obj(brief?.payload?.final_replay_v3);
  if(!Object.keys(raw).length)return brief;
  const matches=obj(raw.match_classifications);
  const questions=list(raw.prospect_question_plan).filter(x=>str(x.text||x.question));
  const unknowns=Object.entries(matches).filter(([,v])=>v?.status==='UNKNOWN');
  const openDims=[
    {dimension_id:'D_SCOPE',label:'Buyer requirement and systems in scope',
     why_open:'The exact assurance deliverable, system coverage and audit boundary remain unconfirmed.'},
    {dimension_id:'D_OWNER',label:'Decision authority and commercial constraints',
     why_open:str(matches.buyer_stakeholder_fit?.reason)||'Internal authority, budget and dates are not established.'},
    ...unknowns.filter(([k])=>!['buyer_stakeholder_fit','engagement_economics'].includes(k))
      .map(([k,v])=>({dimension_id:'D_'+k.toUpperCase(),label:title(k),why_open:str(v.reason)}))
  ].slice(0,7);
  const mappedQ=questions.map((q,i)=>({
    question_id:'Q'+(i+1),dimension_id:i===0?'D_SCOPE':'D_OWNER',
    ask:str(q.text||q.question),why_now:str(q.strategy_alignment||q.intent),
    listen_for:[],linked_service_paths:[],conditional_probes:[]
  }));
  const prepare={
    executive_readout:excerpt(raw.preliminary_brief_markdown,'Executive Summary'),
    call_strategy:{opening_move:'Clarify scope and decision authority before recommending work.'},
    signals_that_matter:Object.entries(matches).filter(([,v])=>v?.status==='MATCH'&&list(v?.basis_ids).length)
      .map(([k,v])=>({signal:title(k),observation:str(v.reason),
        call_implication:'Verify the supporting evidence and its limitations during discovery.'})),
    open_dimensions:openDims,
    expandable_blocks:{
      evidence:[],
      reasoning:Object.entries(matches).map(([k,v])=>({title:title(k)+' · '+title(v?.status),
        observation:str(v?.reason),premises:list(v?.basis_ids),not_a_claim_of:['Independent verification of buyer intent']})),
      unknowns:unknowns.map(([k,v])=>({title:title(k),why_unknown:str(v.reason),
        what_would_resolve_it:'Confirm directly with the prospect.'}))
    }
  };
  const discovery={
    call_objective:'Clarify the buyer assurance requirement, project scope and decision authority.',
    primary_questions:mappedQ,
    call_flow:mappedQ.map((q,i)=>({move:'Use '+q.question_id+' to resolve '+(i===0?'assurance scope':'decision ownership'),
      advance_when:'Record a verified response or leave the variable open.'})),
    do_not_ask:[],
    end_of_call_decision:{ready_for_next_step_if:[],remain_in_discovery_if:[],disqualify_or_deprioritize_if:[]}
  };
  const sourceLedger=list(raw.intelligence_lineage).map(e=>({id:str(e.evidence_id||e.source_id),
    authority:str(e.source),description:str(e.description||e.usage)})).filter(x=>x.id);
  return {...brief,payload:{...brief.payload,prepare,discovery,scorecard:null,
    replay_evidence:sourceLedger,replay_assessment:{
      supported_match:metric(raw.deterministic_metrics?.supported_match),
      evidence_completeness:metric(raw.deterministic_metrics?.evidence_completeness),
      scorable_coverage:metric(raw.deterministic_metrics?.scorable_coverage),
      raw_question_count:questions.length,
      source_assurance:brief.context?.source_assurance||'Internal audit only'
    }}};
}
