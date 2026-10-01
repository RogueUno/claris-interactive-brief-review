const root=document.getElementById('brief-root');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const text=v=>String(v??'').trim();
const uniq=xs=>[...new Set(xs.map(text).filter(Boolean))];
const safeUrl=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
const titleCase=value=>text(value).toLowerCase().replace(/(^|\s)\S/g,m=>m.toUpperCase());
const excerpt=(value,max=180)=>{const raw=text(value);if(raw.length<=max)return raw;const cut=raw.slice(0,max);const boundary=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('; '),cut.lastIndexOf(', '),cut.lastIndexOf(' '));return raw.slice(0,boundary>100?boundary:max).trim()+'…';};

const ICONS={
  user:'<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  message:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
  spark:'<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  shield:'<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  building:'<path d="M3 21h18M6 21V4h8v17M14 9h4v12M9 8h2M9 12h2M9 16h2"/>',
  radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 6M12 3v2M21 12h-2M12 21v-2M3 12h2"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
  route:'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h5a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3H9a3 3 0 0 0-3 3v2"/>',
  skip:'<path d="m5 5 14 14M9 9v8M15 7v8M5 7v10M19 7v10"/>',
  question:'<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 0 1 4.6 1c0 2-2.4 2.2-2.4 4M12 18h.01"/>',
  ear:'<path d="M6 10a6 6 0 1 1 12 0c0 4-3 4-3 7a3 3 0 0 1-6 0"/><path d="M9 10a3 3 0 1 1 6 0c0 2-2 2-2 4"/>',
  branch:'<path d="M6 3v12a4 4 0 0 0 4 4h8"/><circle cx="6" cy="3" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 9h6a4 4 0 0 0 4-4V3"/><circle cx="16" cy="3" r="2"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  x:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  layers:'<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  file:'<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/>'
};
function icon(name,cls='icon'){return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.spark}</svg>`;}

function tokenFromFragment(){const raw=location.hash.startsWith('#')?location.hash.slice(1):'';return String(new URLSearchParams(raw).get('brief')||'').trim()||null;}
function clearFragment(){history.replaceState(null,document.title,location.pathname+location.search);}
async function requestJson(url,options={}){const {headers={},...rest}=options;const r=await fetch(url,{...rest,credentials:'same-origin',headers:{'Content-Type':'application/json',...headers}});let body=null;try{body=await r.json();}catch{}return{ok:r.ok,status:r.status,body};}
function gate(title,detail){root.innerHTML=`<section class="gate panel"><div class="eyebrow">CLARIS · Private Opportunity Intelligence</div><h1>${esc(title)}</h1><p>${esc(detail)}</p></section>`;}
function hostname(url){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return 'Source';}}
function statusTone(status){if(['MATCH','COMPLETE','READY'].includes(status))return'good';if(['PARTIAL_MATCH','PARTIAL','WEAK'].includes(status))return'partial';if(['MISMATCH','MISSING','NOT_READY'].includes(status))return'bad';return'unknown';}
function evidenceHeadline(descriptor){return text(descriptor).replace(/\s+evidence basis$/i,'')||'Not assessed';}

function metricDetails(label,scorecard){
  const fit=scorecard?.lead_fit||{}, evidence=scorecard?.evidence_coverage||{}, ready=scorecard?.call_readiness||{};
  if(label==='fit'){
    return {
      title:'Lead fit',
      answer:fit.grade||'—',
      descriptor:fit.grade?fit.descriptor:'Early evaluated signal',
      icon:'spark',
      body:`<p class="tray-lead">${fit.grade
        ? `${esc(fit.scorable_coverage??0)} of 100 weighted fit criteria are currently scorable.`
        : `Only ${esc(fit.scorable_coverage??0)} of 100 weighted fit criteria are currently scorable, so CLARIS suppresses the letter grade.`}</p>
        <ul class="metric-breakdown">${arr(fit.dimensions).map(x=>`<li><div><strong>${esc(x.label)}</strong><p>${esc(x.reason)}</p></div><span class="status ${statusTone(x.status)}">${esc(text(x.status).replaceAll('_',' '))}</span></li>`).join('')}</ul>`
    };
  }
  if(label==='evidence'){
    return {
      title:'Evidence coverage',
      answer:evidenceHeadline(evidence.descriptor),
      descriptor:'Source quality and diagnostic coverage',
      icon:'shield',
      body:`<p class="tray-lead">Deterministic evidence score: ${esc(evidence.score??'—')} / 100. The number stays in the audit layer rather than the headline.</p>
        <ul class="metric-breakdown">${arr(evidence.dimensions).map(x=>`<li><div><strong>${esc(x.label)}</strong><p>${esc(x.reason)}</p></div><span class="status ${statusTone(x.status)}">${esc(text(x.status).replaceAll('_',' '))}</span></li>`).join('')}</ul>`
    };
  }
  return {
    title:'Call readiness',
    answer:titleCase(ready.status||'—'),
    descriptor:ready.open_variables?`${ready.open_variables} material variable${ready.open_variables===1?'':'s'} mapped to discovery`:'Diagnostic state',
    icon:'target',
    body:`<p class="tray-lead">${ready.status==='READY'?'Each admitted variable has a primary question and the publication gates passed.':'One or more question-coverage or certification gates remain unresolved.'}</p>`
  };
}

function scorecardMarkup(scorecard){
  if(scorecard?.schema_version!=='CLARIS_PRECALL_SCORECARD_V1'){
    return `<section class="instrument-row">
      <div class="instrument">${icon('spark')}<span>Lead fit</span><strong>—</strong><p>Not yet scored</p></div>
      <div class="instrument">${icon('shield')}<span>Evidence coverage</span><strong>—</strong><p>Not yet assessed</p></div>
      <div class="instrument">${icon('target')}<span>Call readiness</span><strong>—</strong><p>Not yet assessed</p></div>
    </section>`;
  }
  const items=['fit','evidence','ready'].map(key=>metricDetails(key,scorecard));
  return `<section class="signal-block">
    <div class="instrument-row">${items.map((x,i)=>`<button type="button" class="instrument${i===0?' is-active':''}" data-score="${['fit','evidence','ready'][i]}">
      <span class="instrument-top">${icon(x.icon)}<span>${esc(x.title)}</span></span>
      <strong class="${i===0?'grade':''}">${esc(x.answer)}</strong>
      <p>${esc(x.descriptor)}</p>
      <small>Why ${icon('arrow','mini-icon')}</small>
    </button>`).join('')}</div>
    <div class="score-tray panel" data-score-tray></div>
  </section>`;
}

function bookingMarkup(value){
  const raw=text(value);if(!raw)return'';
  const quote=excerpt(raw,210);
  return `<details class="booking-request" ${raw.length<=230?'open':''}>
    <summary>
      <span class="booking-icon">${icon('message')}</span>
      <div><span class="eyebrow">Booking request</span><blockquote>${esc(quote)}</blockquote></div>
      <span class="source-tag">Prospect provided</span>
    </summary>
    ${raw.length>230?`<div class="booking-full">${esc(raw)}</div>`:''}
  </details>`;
}

function knownGoingIn(discovery){
  const direct=arr(discovery?.do_not_ask).filter(x=>x?.reason==='RESEARCH_ALREADY_ANSWERED').map(x=>({title:text(x.topic),detail:text(x.detail)}));
  const context=uniq(arr(discovery?.primary_questions).flatMap(q=>arr(q?.already_known_context))).map(detail=>({title:'Established context',detail}));
  const seen=new Set(),result=[];
  for(const item of [...direct,...context]){
    const key=item.detail.toLowerCase();if(!item.detail||seen.has(key))continue;
    seen.add(key);result.push(item);if(result.length>=5)break;
  }
  return result;
}

function questionMap(discovery){
  return new Map(arr(discovery?.primary_questions).filter(q=>q?.dimension_id).map(q=>[text(q.dimension_id),q]));
}

function mentalModelMarkup(known,unresolved,discovery){
  const byDim=questionMap(discovery);
  return `<div class="mental-model">
    <aside class="known-rail panel">
      <div class="section-title small">${icon('check')}<div><span class="eyebrow">Known going in</span><h3>Already established</h3></div></div>
      <p class="rail-intro">Use these to skip redundant discovery.</p>
      <ul>${known.map(x=>`<li><span class="dot-check">${icon('check','mini-icon')}</span><div><strong>${esc(x.detail)}</strong><small>${esc(x.title)}</small></div></li>`).join('')}</ul>
    </aside>
    <section class="blindspots panel">
      <div class="section-title">${icon('alert')}<div><span class="eyebrow">Still unresolved</span><h3>Critical scoping blindspots</h3></div></div>
      <p class="blindspot-intro">These are the variables that should materially change scope, qualification or next action.</p>
      <div class="blindspot-list">${arr(unresolved).map(x=>{
        const q=byDim.get(text(x.dimension_id));
        return `<article>
          <span class="blindspot-icon">${icon('alert')}</span>
          <div class="blindspot-copy"><strong>${esc(x.label)}</strong><p>${esc(x.why_open)}</p></div>
          ${q?`<a href="#question-${esc(q.question_id)}" class="resolve-link">${icon('question','mini-icon')} Resolved by ${esc(q.question_id)}</a>`:''}
        </article>`;
      }).join('')}</div>
    </section>
  </div>`;
}

function contextMarkup(signals){
  const visible=arr(signals).slice(0,3),rest=arr(signals).slice(3);
  const item=s=>`<article class="context-card">
    <div class="context-icon">${icon('radar')}</div>
    <div class="context-copy">
      <strong>${esc(s.signal)}</strong>
      <p>${esc(s.observation)}</p>
    </div>
    <div class="implication"><span>${icon('arrow','mini-icon')} Why it matters</span><p>${esc(s.call_implication)}</p></div>
  </article>`;
  return `<div class="context-list">${visible.map(item).join('')}</div>
    ${rest.length?`<details class="more-context"><summary>${icon('layers','mini-icon')} More company context · ${rest.length}</summary><div class="context-list secondary">${rest.map(item).join('')}</div></details>`:''}`;
}

function doNotAskMarkup(discovery,strategy){
  const items=uniq([...arr(strategy?.avoid_early),...arr(discovery?.do_not_ask).map(x=>x?.detail||x?.topic)]).slice(0,6);
  if(!items.length)return'';
  return `<aside class="dont-reask panel">
    <div class="dont-reask-title">${icon('skip')}<div><span class="eyebrow">Already established</span><strong>Don't re-ask</strong></div></div>
    <div class="dont-reask-items">${items.map(x=>`<span>${esc(x)}</span>`).join('')}</div>
  </aside>`;
}

function choreographyMarkup(flow,strategy){
  return `<div class="choreography panel">
    <div class="opening-cue">${icon('compass')}<div><span class="eyebrow">Opening cue</span><p>${esc(strategy?.opening_move||'Use known context to skip redundant discovery.')}</p></div></div>
    <ol>${arr(flow).map(x=>`<li>
      <span class="phase-number">${String(x.step).padStart(2,'0')}</span>
      <div class="phase-main"><strong>${esc(x.move)}</strong><details><summary>Advance condition</summary><p>${esc(x.advance_when)}</p></details></div>
      <span class="phase-icon">${icon(x.step===arr(flow).length?'arrow':'route')}</span>
    </li>`).join('')}</ol>
  </div>`;
}

function listenMarkup(items){
  return `<ul class="listen-list">${arr(items).map(x=>`<li>
    <span class="listen-icon">${icon('ear')}</span>
    <div><strong>${esc(x.pattern)}</strong><p>${esc(x.meaning)}</p>${x.next_effect?`<small>Then · ${esc(x.next_effect)}</small>`:''}</div>
  </li>`).join('')}</ul>`;
}

function questionMarkup(q,index,openDimensions){
  const dim=openDimensions.get(text(q.dimension_id));
  const branches=arr(q.conditional_probes).map(p=>`<details class="branch">
    <summary>${icon('branch','mini-icon')} ${esc(p.trigger_if)}</summary>
    <div><p><span>Ask</span> ${esc(p.ask)}</p><p><span>Why</span> ${esc(p.why)}</p><p><span>Listen for</span> ${esc(arr(p.listen_for).join(' · '))}</p><p><span>What changes</span> ${esc(p.what_changes)}</p></div>
  </details>`).join('');
  const services=arr(q.linked_service_paths).map(s=>`<li>${esc(s.condition)}</li>`).join('');
  return `<article class="question" id="question-${esc(q.question_id)}">
    <button type="button" class="question-head" aria-expanded="false">
      <span class="q-number">${String(index+1).padStart(2,'0')}</span>
      <div class="q-title">
        <div class="q-tags"><span class="priority-tag">${icon('target','mini-icon')} Must establish</span>${dim?`<span class="resolves-tag">${icon('alert','mini-icon')} Resolves ${esc(dim.label)}</span>`:''}</div>
        <strong>${esc(q.ask)}</strong>
      </div>
      <span class="q-open">Open ${icon('arrow','mini-icon')}</span>
    </button>
    <div class="question-panel" hidden>
      <div class="question-first-layer">
        <section><span class="sub-label">${icon('spark','mini-icon')} Why this matters</span><p>${esc(q.why_now)}</p></section>
        <section><span class="sub-label">${icon('check','mini-icon')} Don't re-ask</span>${arr(q.already_known_context).map(x=>`<p>${esc(x)}</p>`).join('')}</section>
      </div>
      <section class="listen-section"><span class="sub-label">${icon('ear','mini-icon')} Listen for</span>${listenMarkup(q.listen_for)}</section>
      <details class="advanced">
        <summary>${icon('branch','mini-icon')} Advanced branches & answer effects</summary>
        <div class="advanced-grid">
          <div>${branches||'<p class="quiet">No conditional probe is currently authorized.</p>'}</div>
          <div class="answer-effects"><span class="sub-label">What this answer changes</span><p>${esc(q.what_the_answer_changes)}</p><p><strong>Stop when:</strong> ${esc(q.stop_condition)}</p>${services?`<ul>${services}</ul>`:''}</div>
        </div>
      </details>
    </div>
  </article>`;
}

function decisionMarkup(discovery,nextAction){
  const ready=arr(discovery?.end_of_call_decision?.ready_for_next_step_if);
  const hold=arr(discovery?.end_of_call_decision?.remain_in_discovery_if);
  const stop=arr(discovery?.end_of_call_decision?.disqualify_or_deprioritize_if);
  return `<article class="next-move">
      <div class="next-move-icon">${icon('arrow')}</div>
      <div><span>Recommended next move</span><strong>${esc(nextAction||'Agree the next scoped action with the prospect')}</strong></div>
    </article>
    <div class="conditional-chain">
      <section><span class="chain-icon advance">${icon('check')}</span><div><h3>Advance if</h3><ul>${ready.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></section>
      <section><span class="chain-icon continue">${icon('search')}</span><div><h3>Otherwise continue discovery when</h3><ul>${hold.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></section>
      <section><span class="chain-icon stop">${icon('x')}</span><div><h3>Only deprioritize if</h3><ul>${stop.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></section>
    </div>`;
}

function sourceIndex(prepare){
  const groups=new Map();
  for(const evidence of arr(prepare?.expandable_blocks?.evidence)){
    for(const source of arr(evidence?.sources)){
      const url=safeUrl(source?.url);if(url==='#')continue;
      const key=hostname(url);if(!groups.has(key))groups.set(key,{key,claims:[],used:[],notUsed:[],pages:[]});
      const g=groups.get(key);g.claims.push(...arr(evidence.claims));g.used.push(...arr(evidence.used_for));g.notUsed.push(...arr(evidence.not_used_for));g.pages.push({url,supports:text(source.supports)});
    }
  }
  return [...groups.values()].map(g=>({...g,claims:uniq(g.claims),used:uniq(g.used),notUsed:uniq(g.notUsed),pages:[...new Map(g.pages.map(p=>[p.url,p])).values()]}));
}

function proofMarkup(prepare,groups){
  const totalObs=groups.reduce((n,g)=>n+g.claims.length,0),totalPages=groups.reduce((n,g)=>n+g.pages.length,0);
  return `<details class="proof-drawer">
    <summary>
      <div class="proof-title">${icon('file')}<div><span class="eyebrow">Audit layer</span><h2>Evidence & sources</h2></div></div>
      <p>${totalObs} accepted observations · ${totalPages} pages</p>
      <span>Inspect ${icon('arrow','mini-icon')}</span>
    </summary>
    <div class="proof-body">
      <div class="proof-tabs">
        <button class="is-active" data-proof-tab="evidence">${icon('shield','mini-icon')} Evidence</button>
        <button data-proof-tab="reasoning">${icon('spark','mini-icon')} Reasoning</button>
        <button data-proof-tab="unknowns">${icon('alert','mini-icon')} Unknowns</button>
      </div>
      <div class="proof-panel is-active" data-proof-panel="evidence">
        <div class="source-pills">${groups.map((g,i)=>`<button class="source-pill${i===0?' is-active':''}" data-source="${esc(g.key)}">${icon('link','mini-icon')}<strong>${esc(g.key)}</strong><span>${g.claims.length} obs · ${g.pages.length}p</span></button>`).join('')}</div>
        <div class="source-tray" data-source-tray></div>
      </div>
      <div class="proof-panel" data-proof-panel="reasoning">${arr(prepare?.expandable_blocks?.reasoning).map(r=>`<details class="audit-item"><summary>${icon('spark','mini-icon')}<strong>${esc(r.title)}</strong></summary><div><p>${esc(r.observation)}</p><h5>Premises</h5><ul>${arr(r.premises).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h5>Not a claim of</h5><p>${esc(arr(r.not_a_claim_of).join(' · '))}</p></div></details>`).join('')}</div>
      <div class="proof-panel" data-proof-panel="unknowns">${arr(prepare?.expandable_blocks?.unknowns).map(u=>`<details class="audit-item"><summary>${icon('alert','mini-icon')}<strong>${esc(u.title)}</strong></summary><div><p><b>Why unknown</b> ${esc(u.why_unknown)}</p><p><b>What resolves it</b> ${esc(u.what_would_resolve_it)}</p></div></details>`).join('')}</div>
    </div>
  </details>`;
}

function render(brief){
  const prepare=brief?.payload?.prepare||{},discovery=brief?.payload?.discovery||{},scorecard=brief?.payload?.scorecard||null,context=brief?.context||{};
  const heading=context.prospect_name||brief.company,known=knownGoingIn(discovery),unresolved=arr(prepare.open_dimensions),groups=sourceIndex(prepare),strategy=prepare.call_strategy||{};
  const openDimensions=new Map(unresolved.map(x=>[text(x.dimension_id),x]));
  const nextAction=text(scorecard?.strategy?.recommended_action);
  const meeting=context.meeting_time?new Date(context.meeting_time):null,meetingValid=meeting&&!Number.isNaN(meeting.getTime());
  const readyFirst=arr(discovery?.end_of_call_decision?.ready_for_next_step_if)[0];

  root.innerHTML=`
    <header class="topbar">
      <a class="brand" href="#top">${icon('spark','brand-icon')}<span>CLARIS</span></a>
      <nav class="nav" aria-label="Brief sections">
        <a href="#context">${icon('building','mini-icon')} Context</a>
        <a href="#plan">${icon('route','mini-icon')} Call plan</a>
        <a href="#questions">${icon('question','mini-icon')} Questions</a>
        <a href="#next">${icon('arrow','mini-icon')} Next move</a>
        <a href="#evidence">${icon('file','mini-icon')} Evidence</a>
      </nav>
      <span class="private-meta">${icon('lock','mini-icon')} Private · expires ${esc(new Date(brief.expires_at).toLocaleDateString())}</span>
    </header>

    <section id="top" class="hero">
      <div class="hero-person">
        <span class="eyebrow">${icon('user','mini-icon')} Scheduled conversation</span>
        <h1>${esc(heading)}</h1>
        <p>${esc(context.prospect_role||'Prospect')} <span>at</span> ${esc(brief.company)}</p>
      </div>
      <div class="hero-time">
        <span class="eyebrow">${icon('calendar','mini-icon')} The call</span>
        <strong>${meetingValid?esc(meeting.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})):'—'}</strong>
        <p>${meetingValid?esc(meeting.toLocaleDateString([], {weekday:'short',day:'numeric',month:'short',year:'numeric'})):'Meeting time not attached'}</p>
      </div>
    </section>

    ${bookingMarkup(context.booking_text)}

    <section class="section opportunity">
      <div class="section-head"><div>${icon('spark')}<div><span class="eyebrow">At a glance</span><h2>Opportunity signal</h2></div></div></div>
      ${scorecardMarkup(scorecard)}

      <article class="call-focus panel">
        <div class="focus-icon">${icon('target')}</div>
        <div class="focus-copy">
          <span class="eyebrow">Call focus</span>
          <h2>${esc(discovery.call_objective||strategy.opening_move||'Run a focused diagnostic conversation.')}</h2>
          ${readyFirst?`<p class="success-line"><strong>Success on this call means</strong> ${esc(excerpt(readyFirst,160))}</p>`:''}
          ${prepare.executive_readout?`<details><summary>Working model ${icon('arrow','mini-icon')}</summary><p>${esc(prepare.executive_readout)}</p></details>`:''}
        </div>
      </article>
    </section>

    <section id="context" class="section">
      <div class="section-head"><div>${icon('building')}<div><span class="eyebrow">Context</span><h2>Company & risk context</h2></div></div><p>Only the facts that should change how you run this call.</p></div>
      ${contextMarkup(prepare.signals_that_matter)}
      <div class="subsection-head"><div>${icon('alert')}<div><span class="eyebrow">Mental model</span><h2>Known vs unresolved</h2></div></div></div>
      ${mentalModelMarkup(known,unresolved,discovery)}
    </section>

    <section id="plan" class="section">
      <div class="section-head"><div>${icon('route')}<div><span class="eyebrow">Call plan</span><h2>Conversation choreography</h2></div></div><p>One sequence. No duplicate run-of-show.</p></div>
      ${doNotAskMarkup(discovery,strategy)}
      ${choreographyMarkup(discovery.call_flow,strategy)}
    </section>

    <section id="questions" class="section">
      <div class="section-head"><div>${icon('question')}<div><span class="eyebrow">Questions</span><h2>What you must establish</h2></div></div><p>Primary questions are the few things CLARIS has admitted as unresolved. Branches appear only when earned.</p></div>
      <div class="questions">${arr(discovery.primary_questions).map((q,i)=>questionMarkup(q,i,openDimensions)).join('')}</div>
    </section>

    <section id="next" class="section">
      <div class="section-head"><div>${icon('arrow')}<div><span class="eyebrow">Next move</span><h2>Decision gate</h2></div></div></div>
      ${decisionMarkup(discovery,nextAction)}
    </section>

    <section id="evidence" class="section evidence-section">
      ${proofMarkup(prepare,groups)}
    </section>
  `;

  bindScore(scorecard);
  bindQuestions();
  bindProof(groups);
}

function bindScore(scorecard){
  if(scorecard?.schema_version!=='CLARIS_PRECALL_SCORECARD_V1')return;
  const tray=root.querySelector('[data-score-tray]');if(!tray)return;
  const buttons=[...root.querySelectorAll('[data-score]')];
  const render=key=>{
    const detail=metricDetails(key,scorecard);
    tray.innerHTML=`<div class="score-tray-head">${icon(detail.icon)}<div><span class="eyebrow">${esc(detail.title)}</span><h3>${esc(detail.answer)} · ${esc(detail.descriptor)}</h3></div></div>${detail.body}`;
  };
  buttons.forEach(b=>b.addEventListener('click',()=>{
    buttons.forEach(x=>x.classList.toggle('is-active',x===b));render(b.dataset.score);
  }));
  render('fit');
}

function bindQuestions(){
  root.querySelectorAll('.question-head').forEach(button=>button.addEventListener('click',()=>{
    const panel=button.nextElementSibling,open=button.getAttribute('aria-expanded')==='true';
    button.setAttribute('aria-expanded',String(!open));panel.hidden=open;
    const word=button.querySelector('.q-open');if(word)word.innerHTML=(open?'Open ':'Close ')+icon('arrow','mini-icon');
  }));
}

function bindProof(groups){
  const groupMap=new Map(groups.map(g=>[g.key,g])),tray=root.querySelector('[data-source-tray]');
  const render=key=>{const g=groupMap.get(key);if(!g||!tray)return;tray.innerHTML=`
    <div class="source-tray-head">${icon('link')}<div><span class="eyebrow">Source</span><h3>${esc(g.key)}</h3></div><small>${g.claims.length} observations · ${g.pages.length} pages</small></div>
    <div class="source-columns"><div><span class="sub-label">Accepted observations</span><ul>${g.claims.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div><span class="sub-label">Used to support</span><p>${esc(g.used.join(' · ')||'Bounded call preparation.')}</p><span class="sub-label">Explicitly not used to infer</span><p>${esc(g.notUsed.join(' · ')||'No unsupported conclusion.')}</p></div></div>
    <div class="source-links">${g.pages.map(p=>`<a href="${safeUrl(p.url)}" target="_blank" rel="noopener noreferrer">${icon('link','mini-icon')}<span>${esc(p.supports||p.url)}</span></a>`).join('')}</div>`;};
  const pills=[...root.querySelectorAll('[data-source]')];pills.forEach(b=>b.addEventListener('click',()=>{pills.forEach(x=>x.classList.toggle('is-active',x===b));render(b.dataset.source);}));if(groups[0])render(groups[0].key);
  const tabs=[...root.querySelectorAll('[data-proof-tab]')];tabs.forEach(b=>b.addEventListener('click',()=>{tabs.forEach(x=>x.classList.toggle('is-active',x===b));root.querySelectorAll('[data-proof-panel]').forEach(p=>p.classList.toggle('is-active',p.dataset.proofPanel===b.dataset.proofTab));}));
}

async function boot(){
  const gateway='/api/delivery/package',token=tokenFromFragment();
  if(token){clearFragment();const resolved=await requestJson(gateway,{method:'POST',headers:{'X-Claris-Delivery':'brief_resolve'},body:JSON.stringify({brief_token:token})});if(!resolved.ok){gate('This private brief could not be opened.',resolved.status===410?'The link expired or was revoked.':'Request a fresh CLARIS brief link.');return;}}
  const loaded=await requestJson(gateway,{method:'POST',headers:{'X-Claris-Delivery':'brief_data'},body:JSON.stringify({})});
  if(!loaded.ok){gate('A private brief link is required.',loaded.status===410?'This brief expired or was revoked.':'Open the CLARIS link you received to view this brief.');return;}
  render(loaded.body.brief);
}
boot().catch(()=>gate('This private brief could not be opened.','A network or server error occurred. Request a fresh CLARIS brief link.'));
