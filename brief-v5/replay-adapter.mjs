const list=x=>Array.isArray(x)?x:[];
const str=x=>typeof x==='string'?x.trim():'';
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
const title=x=>str(x).replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
const justification=x=>str(x?.reason)||str(x?.reasoning);
const admissibleStatus=new Set(['MATCH','PARTIAL_MATCH','UNKNOWN','MISMATCH']);
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
  // Extract only a source-explicit observation; never infer missing demographics.
  const sources=admittedEvidence(records);
  const fields={};
  const add=(key,label,value,entry)=>{
    if(!value||fields[key])return;
    const reported=entry.authority!=='VERIFIED_PUBLIC_FACT';
    fields[key]={label,display:value+(reported?' (reported)':''),supported:true,
      source_url:entry.source_url,source_label:reported?'External listing · not independently verified':'Admitted public source'};
  };
  for(const entry of sources){
    const excerpt=str(entry.source_excerpt);
    let m=excerpt.match(/\b(?:founded|established)\s+(?:in\s+)?((?:19|20)\d{2})\b/i);
    if(m)add('founded_year','Founded',m[1],entry);
    m=excerpt.match(/\b(?:headquartered|headquarters|based)\s+(?:in|at)\s+([A-Za-z][A-Za-z .-]{2,45})(?=[,.;]|\s+(?:and|with|founded|in)\b|$)/i);
    if(m)add('headquarters','Headquarters',m[1].trim(),entry);
    m=excerpt.match(/\b(\d{1,3}\s*[-–]\s*\d{2,5})\s+employees\b/i);
    if(m)add('employee_size','Company size',m[1].replace(/\s/g,'').replace('-', '–')+' employees',entry);
    if(/\bsoftware development company\b/i.test(excerpt))add('company_type','Company type','Software development',entry);
  }
  if(!Object.keys(fields).length)return null;
  return {schema_version:'CLARIS_COMPANY_SNAPSHOT_V1',authority:'PRESENTATION_ONLY',
    validation:{ok:true},coverage:{renderable:true,partial:Object.keys(fields).length<3},
    fields,intro:{supported:true,display:'Available public-source facts · verify before use'}};
}

export function projectFinalReplay(brief,{evidenceRegistry=[]}={}){
  const raw=obj(brief?.payload?.final_replay_v3);
  if(!Object.keys(raw).length)return brief;
  const matches=Object.keys(obj(raw.match_classifications)).length?obj(raw.match_classifications):obj(raw.match_score_explanation);
  const questions=(list(raw.prospect_question_plan).length?list(raw.prospect_question_plan):list(raw.question_plan)).filter(x=>str(x.text||x.question));
  const unknowns=Object.entries(matches).filter(([,v])=>v?.status==='UNKNOWN');
  // Open dimensions and question purposes are independent. Never assign by position.
  const openDims=unknowns.map(([key,v])=>({
    dimension_id:'D_'+key.toUpperCase(),label:title(key),
    why_open:justification(v)||'The provider has not established this dimension.',
    origin:'FINALIZE_UNKNOWN',basis_ids:list(v?.basis_ids)
  }));
  const mappedQ=questions.map((q,i)=>({
    question_id:'Q'+(i+1),provider_question_id:str(q.question_id)||null,
    dimension_id:null,ask:str(q.text||q.question),
    why_now:str(q.strategy_alignment||q.intent||q.rationale),
    listen_for:list(q.listen_for),conditional_probes:list(q.conditional_probes),
    possible_service_paths:list(q.possible_service_paths),
    origin:'FINALIZE_GENERATED_QUESTION'
  }));
  const directory=admittedEvidence(evidenceRegistry).find(x=>x.evidence_id==='FAC-002');
  const potentialSoc2Tension=directory && /\bsoc\s*2\s+(certified|compliant)\b/i.test(str(directory.source_excerpt))
    && list(raw.potential_service_relevance).some(x=>x?.service_id==='SVC_SOC2')
    ?{signal:'Possible assurance-scope mismatch — verify before diagnosing',
      observation:'A third-party directory (FAC-002) describes an existing SOC 2 posture while the simulated buyer requests assurance evidence. The listing may be stale or inaccurate; the mismatch is a hypothesis, not a verified fact.',
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
  const signals=[
    ...(potentialSoc2Tension?[{...potentialSoc2Tension,kind:'UNVERIFIED_HYPOTHESIS',basis_ids:['FAC-002']}]:[]),
    ...Object.entries(matches)
      .filter(([,v])=>['MATCH','PARTIAL_MATCH'].includes(v?.status)
         && list(v?.basis_ids).length && justification(v))
      .map(([key,v])=>({signal:title(key),observation:justification(v),
        kind:'FINALIZE_PROVIDER_ASSESSMENT',status:v.status,basis_ids:list(v.basis_ids),
        call_implication:'Use this provider assessment as a question to verify, not as independently established buyer intent.'}))
  ];
  const prepare={
    executive_readout:excerpt(raw.preliminary_brief_markdown,'Executive Summary')
      ||excerpt(raw.preliminary_brief_markdown,'Strategic Overview')
      ||str(raw.preliminary_brief?.what_matters),
    call_strategy:{opening_move:str(raw.preliminary_brief?.opening_move)||null},
    signals_that_matter:signals,
    open_dimensions:openDims,
    expandable_blocks:{
      evidence:sourceCards(evidenceRegistry),
      reasoning:[...providerNarrative,...hypothesisNarrative,
        ...providerLineage.filter(e=>!/^FAC-/.test(str(e.evidence_id))||admittedIds.has(str(e.evidence_id)))
          .map(e=>({title:str(e.evidence_id)+' · '+str(e.source),
            observation:str(e.description),premises:[str(e.evidence_id)],
            not_a_claim_of:['An independently verified original source']})),
        ...Object.entries(matches).map(([key,v])=>({title:title(key)+' · '+title(v?.status),
          observation:justification(v),premises:list(v?.basis_ids),
          not_a_claim_of:['Independent verification of buyer intent']}))],
      unknowns:unknowns.map(([key,v])=>({title:title(key),
        why_unknown:justification(v)||'The provider did not establish this dimension.',
        what_would_resolve_it:'Ask the buyer for the missing information.'}))
    }
  };
  const discovery={
    call_objective:excerpt(raw.preliminary_brief_markdown,'Primary Objectives')
      ||str(raw.preliminary_brief?.call_objective)||null,
    primary_questions:mappedQ,
    call_flow:mappedQ.map(q=>({question_id:q.question_id,label:q.ask,move:null,advance_when:null})),
    do_not_ask:[],
    end_of_call_decision:null
  };
  const sourceLedger=providerLineage.filter(e=>!/^FAC-/.test(str(e.evidence_id||e.source_id))||admittedIds.has(str(e.evidence_id||e.source_id))).map(e=>({id:str(e.evidence_id||e.source_id),
    authority:str(e.source),description:str(e.description||e.usage)})).filter(x=>x.id);
  const scores=Object.keys(obj(raw.deterministic_metrics)).length?obj(raw.deterministic_metrics):obj(raw.engagement_metadata?.deterministic_metrics);
  const sourceCoverage=Object.keys(obj(raw.completeness_classifications)).length?obj(raw.completeness_classifications):obj(raw.completeness_score_explanation);
  const scorecard={
    schema_version:'CLARIS_PRECALL_SCORECARD_V1',
    lead_fit:{
      grade:null,
      supported_match:metric(scores.supported_match),
      descriptor:'Provider-scored · ungraded',
      scorable_coverage:metric(scores.scorable_coverage),
      dimensions:Object.entries(matches).map(([key,v])=>({
        label:title(key),status:str(v?.status)||'UNKNOWN',
        reason:str(v?.reason||v?.reasoning)||'Provider did not state a reason',
        basis_ids:list(v?.basis_ids)
      }))
    },
    evidence_coverage:{
      score:metric(scores.evidence_completeness),
      score_origin:'FINALIZE_PROVIDER_METRIC',
      validation_status:'NOT_INDEPENDENTLY_VERIFIED',
      dimensions:Object.entries(sourceCoverage).map(([key,v])=>({
        label:title(key),status:str(v?.status)||'UNKNOWN',
        reason:str(v?.reason||v?.reasoning)||'Provider did not state a reason',
        basis_ids:list(v?.basis_ids),points:metric(v?.score)
      }))
    },
    call_readiness:{status:'OPEN',open_variables:openDims.length},
    strategy:{recommended_action:str(raw.preliminary_brief?.recommended_action)||null,source:'FINALIZE_ONLY'},
    source_status:'PROVISIONAL_PROVIDER_REPLAY_NOT_CERTIFIED'
  };
  const {prepare:oldPrepare,discovery:oldDiscovery,scorecard:oldScorecard,company_snapshot:oldSnapshot,
    replay_evidence:oldLedger,replay_assessment:oldAssessment,...originalPayload}=obj(brief.payload);
  return {...brief,payload:{...originalPayload,prepare,discovery,scorecard,
    ...(snapshot(evidenceRegistry)?{company_snapshot:snapshot(evidenceRegistry)}:{}),
    replay_evidence:sourceLedger,replay_assessment:{
      supported_match:metric(scores.supported_match),
      evidence_completeness:metric(scores.evidence_completeness),
      scorable_coverage:metric(scores.scorable_coverage),
      raw_question_count:questions.length,
      source_assurance:brief.context?.source_assurance||'Internal audit only'
    }}};
}
