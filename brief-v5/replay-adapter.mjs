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
function admittedEvidence(records){
  return list(records).filter(x=>x?.admission_status==='ADMITTED'
    && x.sensitivity==='STANDARD'
    && typeof x.evidence_id==='string'
    && /^FAC-\d{3,}$/.test(x.evidence_id)
    && typeof x.source_url==='string'
    && /^https:\/\/[a-z0-9]/i.test(x.source_url));
}
function sourceCards(records){
  return admittedEvidence(records).map(x=>({
    claims:[str(x.source_title)||('Source '+x.evidence_id),...(str(x.source_excerpt)?['Source excerpt (not independently verified): '+str(x.source_excerpt).replace(/\\n/g,' ').replace(/\s+/g,' ').slice(0,320)]:[])],
    used_for:['Public company and technical context ('+x.evidence_id+')'],
    not_used_for:['Proof of current buyer intent, security posture or deal urgency'],
    sources:[{url:x.source_url,source_type:x.authority==='THIRD_PARTY_REPORTED'?'THIRD_PARTY':'PUBLIC_SOURCE',
      supports:x.evidence_id+' · '+(str(x.source_title)||'public source')}]
  }));
}
function snapshot(records){
  const admitted=admittedEvidence(records);
  const two=admitted.find(x=>x.evidence_id==='FAC-002');
  const three=admitted.find(x=>x.evidence_id==='FAC-003');
  const make=(label,display,x)=>x?{label,display,supported:true,source_url:x.source_url,
    source_label:'Third-party listing · not independently verified'}:null;
  const fields={
    founded_year:/founded in 2020/i.test(str(three?.source_excerpt))?make('Founded','2020 (reported)',three):null,
    headquarters:/san francisco/i.test(str(three?.source_excerpt))?make('Headquarters','San Francisco (reported)',three):null,
    employee_size:/51-200 employees/i.test(str(two?.source_excerpt))?make('Company size','51–200 (reported)',two):null,
    company_type:/software development company/i.test(str(two?.source_excerpt))?make('Company type','Software development (reported)',two):null
  };
  const valid=Object.values(fields).filter(x=>x?.supported).length>=3;
  return valid?{schema_version:'CLARIS_COMPANY_SNAPSHOT_V1',authority:'PRESENTATION_ONLY',
    validation:{ok:true},coverage:{renderable:true},fields,
    intro:{supported:true,display:'Public-source profile; figures not independently verified'}}:null;
}

export function projectFinalReplay(brief,{evidenceRegistry=[]}={}){
  const raw=obj(brief?.payload?.final_replay_v3);
  if(!Object.keys(raw).length)return brief;
  const matches=Object.keys(obj(raw.match_classifications)).length?obj(raw.match_classifications):obj(raw.match_score_explanation);
  const questions=(list(raw.prospect_question_plan).length?list(raw.prospect_question_plan):list(raw.question_plan)).filter(x=>str(x.text||x.question));
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
    ask:str(q.text||q.question),why_now:str(q.strategy_alignment||q.intent||q.rationale),
    listen_for:[],linked_service_paths:[],conditional_probes:[]
  }));
  const directory=admittedEvidence(evidenceRegistry).find(x=>x.evidence_id==='FAC-002');
  const potentialSoc2Tension=directory && /\bsoc\s*2\s+(certified|compliant)\b/i.test(str(directory.source_excerpt))
    && list(raw.potential_service_relevance).some(x=>x?.service_id==='SVC_SOC2')
    ?{signal:'Possible assurance-scope mismatch — verify before diagnosing',
      observation:'A third-party directory (FAC-002) describes an existing SOC 2 posture while the accepted prospect response requests formal SOC 2 readiness. The listing may be stale or inaccurate; the mismatch is a hypothesis, not a verified fact.',
      call_implication:'Ask whether the buyer needs a current report, questionnaire support, a new or expanded audit boundary, or initial control readiness. Do not presume certification or a security gap.'}:null;
  const admittedIds=new Set(admittedEvidence(evidenceRegistry).map(x=>x.evidence_id));
  const providerLineage=list(raw.intelligence_lineage).flatMap(edge=>
    list(edge?.evidence_ids).length
      ?list(edge.evidence_ids).map(id=>({evidence_id:str(id),source:'FINALIZE_DECLARED_LINEAGE',description:str(edge.insight||edge.claim)}))
      :[edge]);

  const providerNarrative=['Strategic Guidance','Critical Context','Strategic Overview','Critical Timing & Stakeholders','Primary Objectives']
    .map(heading=>({heading,content:excerpt(raw.preliminary_brief_markdown,heading).split('\n').filter(line=>(line.match(/\bFAC-\d{3,}\b/g)||[]).every(id=>admittedIds.has(id))).join('\n')}))
    .filter(x=>x.content)
    .map(x=>({
      title:'FINALIZE provider narrative · '+x.heading,
      observation:x.content.replace(/\*\*/g,'').trim(),
      premises:(x.content.match(/\bFAC-\d{3,}\b/g)||[]).filter(id=>admittedIds.has(id)),
      not_a_claim_of:['A fact independently verified from the provider narrative','A certified recommendation or guaranteed engagement outcome']
    }));
  const hypothesisNarrative=list(raw.consultant_only_context?.hypotheses)
    .filter(x=>str(x.description))
    .map(x=>({title:'Consultant-only hypothesis · unverified',observation:str(x.description),
      premises:list(x.basis_ids).filter(id=>id==='BOOK-001'||admittedIds.has(id)),
      not_a_claim_of:['A current security weakness','Buyer intent','Confirmed cause of the booking']}));
  const prepare={
    executive_readout:excerpt(raw.preliminary_brief_markdown,'Executive Summary')||excerpt(raw.preliminary_brief_markdown,'Strategic Overview')||str(raw.preliminary_brief?.what_matters),
    call_strategy:{opening_move:'Clarify scope and decision authority before recommending work.'},
    signals_that_matter:[...(potentialSoc2Tension?[potentialSoc2Tension]:[]),...Object.entries(matches).filter(([,v])=>v?.status==='MATCH'&&list(v?.basis_ids).length)
      .map(([k,v])=>({signal:title(k),observation:str(v.reason),
        call_implication:'Verify the supporting evidence and its limitations during discovery.'}))],
    open_dimensions:openDims,
    expandable_blocks:{
      evidence:sourceCards(evidenceRegistry),
      reasoning:[...providerNarrative,...hypothesisNarrative,...providerLineage.filter(e=>!/^FAC-/.test(str(e.evidence_id))||admittedIds.has(str(e.evidence_id))).map(e=>({title:str(e.evidence_id)+' · '+str(e.source),observation:str(e.description),premises:[str(e.evidence_id)],not_a_claim_of:['Independently verified original source URL']})),...Object.entries(matches).map(([k,v])=>({title:title(k)+' · '+title(v?.status),observation:str(v?.reason),premises:list(v?.basis_ids),not_a_claim_of:['Independent verification of buyer intent']}))],
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
  const sourceLedger=providerLineage.filter(e=>!/^FAC-/.test(str(e.evidence_id||e.source_id))||admittedIds.has(str(e.evidence_id||e.source_id))).map(e=>({id:str(e.evidence_id||e.source_id),
    authority:str(e.source),description:str(e.description||e.usage)})).filter(x=>x.id);
  const scores=Object.keys(obj(raw.deterministic_metrics)).length?obj(raw.deterministic_metrics):obj(raw.engagement_metadata?.deterministic_metrics);
  const scorecard={schema_version:'CLARIS_PRECALL_SCORECARD_V1',lead_fit:{grade:null,scorable_coverage:metric(scores.scorable_coverage),dimensions:[]},evidence_coverage:{score:metric(scores.evidence_completeness),dimensions:[]},call_readiness:{status:'OPEN',open_variables:openDims.length},strategy:{recommended_action:'Confirm assurance requirements, project scope and decision authority before recommending an engagement.'},source_status:'PROVISIONAL_PROVIDER_REPLAY_NOT_CERTIFIED'};
  return {...brief,payload:{...brief.payload,prepare,discovery,scorecard,
    ...(snapshot(evidenceRegistry)?{company_snapshot:snapshot(evidenceRegistry)}:{}),
    replay_evidence:sourceLedger,replay_assessment:{
      supported_match:metric(scores.supported_match),
      evidence_completeness:metric(scores.evidence_completeness),
      scorable_coverage:metric(scores.scorable_coverage),
      raw_question_count:questions.length,
      source_assurance:brief.context?.source_assurance||'Internal audit only'
    }}};
}
