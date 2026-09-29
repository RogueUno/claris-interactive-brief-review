const root=document.getElementById('brief-root');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const text=v=>String(v??'').trim();
const uniq=xs=>[...new Set(xs.map(text).filter(Boolean))];
const safeUrl=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
const excerpt=(value,max=180)=>{const raw=text(value);if(raw.length<=max)return raw;const cut=raw.slice(0,max);const boundary=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('; '),cut.lastIndexOf(', '),cut.lastIndexOf(' '));return raw.slice(0,boundary>100?boundary:max).trim()+'…';};

const ICONS={
  spark:'<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  user:'<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
  briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  message:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
  shield:'<path d="M12 22s8-3.5 8-10V5l-8-3-8 3v7c0 6.5 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 6M12 3v2M21 12h-2"/>',
  check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/>',
  route:'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h5a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3H9a3 3 0 0 0-3 3v2"/>',
  ear:'<path d="M6 10a6 6 0 1 1 12 0c0 4-3 4-3 7a3 3 0 0 1-6 0"/><path d="M9 10a3 3 0 1 1 6 0c0 2-2 2-2 4"/>',
  branch:'<path d="M6 3v12a4 4 0 0 0 4 4h8"/><circle cx="6" cy="3" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 9h6a4 4 0 0 0 4-4V3"/><circle cx="16" cy="3" r="2"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  file:'<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 13h6M9 17h6"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  hypothesis:'<path d="M4 18c3-8 7-12 16-12M6 7l-2 11 11-2"/><circle cx="18" cy="6" r="2"/>',
  fact:'<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>'
};
function icon(name,cls='icon'){return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.spark}</svg>`;}

function tokenFromFragment(){const raw=location.hash.startsWith('#')?location.hash.slice(1):'';return String(new URLSearchParams(raw).get('brief')||'').trim()||null;}
function clearFragment(){history.replaceState(null,document.title,location.pathname+location.search);}
async function requestJson(url,options={}){const {headers={},...rest}=options;const r=await fetch(url,{...rest,credentials:'same-origin',headers:{'Content-Type':'application/json',...headers}});let body=null;try{body=await r.json();}catch{}return{ok:r.ok,status:r.status,body};}
function gate(title,detail){root.innerHTML=`<section class="gate panel"><div class="eyebrow">CLARIS · Private Opportunity Intelligence</div><h1>${esc(title)}</h1><p>${esc(detail)}</p></section>`;}
function hostname(url){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return'Source';}}
function statusTone(status){if(['MATCH','COMPLETE','READY'].includes(status))return'good';if(['PARTIAL_MATCH','PARTIAL','WEAK'].includes(status))return'partial';if(['MISMATCH','MISSING','NOT_READY'].includes(status))return'bad';return'unknown';}

function gradeScale(letter){
  const n={D:1,C:2,B:3,A:4}[letter]||0;
  return `<span class="grade-scale" aria-hidden="true">${[1,2,3,4].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</span>`;
}
function evidenceLevel(score){
  const n=Number(score);
  if(!Number.isFinite(n))return{label:'Not assessed',level:0};
  if(n>=85)return{label:'Very strong',level:4};
  if(n>=70)return{label:'Strong',level:3};
  if(n>=55)return{label:'Usable',level:2};
  if(n>=40)return{label:'Thin',level:1};
  return{label:'Insufficient',level:1};
}
function levelScale(level){
  return `<span class="grade-scale evidence-scale" aria-hidden="true">${[1,2,3,4].map(i=>`<i class="${i<=level?'on':''}"></i>`).join('')}</span>`;
}
function gaugeArc({value=0,display='—',caption='',tone='accent',badge=''}) {
  const v=Math.max(0,Math.min(100,Number(value)||0));
  return `<div class="gauge gauge-${esc(tone)}" aria-hidden="true">
    <svg viewBox="0 0 180 108" role="presentation">
      <path class="gauge-track" d="M18 91 A72 72 0 0 1 162 91" pathLength="100"/>
      <path class="gauge-value" d="M18 91 A72 72 0 0 1 162 91" pathLength="100" style="stroke-dasharray:${v} 100"/>
      <g class="gauge-ticks">
        <path d="M28 71l8 4"/><path d="M52 41l6 7"/><path d="M89 28v10"/><path d="M128 41l-6 7"/><path d="M152 71l-8 4"/>
      </g>
      <text class="gauge-display" x="90" y="82" text-anchor="middle">${esc(display)}</text>
      <text class="gauge-caption" x="90" y="100" text-anchor="middle">${esc(caption)}</text>
    </svg>
    ${badge?`<span class="gauge-badge">${esc(badge)}</span>`:''}
  </div>`;
}
function gradeGauge(letter){
  const rank={D:18,C:42,B:68,A:94}[text(letter).toUpperCase()]||0;
  return gaugeArc({value:rank,display:text(letter)||'—',caption:'Lead fit',tone:'deep'});
}
function readinessGauge(ready){
  const isReady=text(ready?.status)==='READY';
  return gaugeArc({
    value:isReady?94:58,
    display:isReady?'READY':'OPEN',
    caption:'Call readiness',
    tone:isReady?'accent':'warm',
    badge:ready?.open_variables?`${ready.open_variables} open`:''
  });
}

function scoreDetail(key,scorecard){
  const fit=scorecard?.lead_fit||{},ev=scorecard?.evidence_coverage||{},ready=scorecard?.call_readiness||{};
  if(key==='fit')return{
    title:'Lead fit',answer:fit.grade||'—',descriptor:fit.grade?fit.descriptor:'Early evaluated signal',icon:'spark',
    body:`<p>${fit.grade?`${esc(fit.scorable_coverage??0)} of 100 weighted fit criteria are currently scorable.`:`Only ${esc(fit.scorable_coverage??0)} of 100 weighted criteria are scorable, so CLARIS suppresses the letter grade.`}</p>
    <ul class="metric-list">${arr(fit.dimensions).map(x=>`<li><div><strong>${esc(x.label)}</strong><p>${esc(x.reason)}</p></div><span class="status ${statusTone(x.status)}">${esc(text(x.status).replaceAll('_',' '))}</span></li>`).join('')}</ul>`
  };
  if(key==='evidence')return{
    title:'Evidence coverage',answer:evidenceLevel(ev.score).label,descriptor:'Source support and diagnostic coverage',icon:'shield',
    body:`<p>Audit score: ${esc(ev.score??'—')} / 100. This stays in the explanation layer because it measures evidence completeness, not prospect fit.</p>
    <ul class="metric-list">${arr(ev.dimensions).map(x=>`<li><div><strong>${esc(x.label)}</strong><p>${esc(x.reason)}</p></div><span class="status ${statusTone(x.status)}">${esc(text(x.status).replaceAll('_',' '))}</span></li>`).join('')}</ul>`
  };
  return{
    title:'Call readiness',answer:text(ready.status||'—').replaceAll('_',' '),descriptor:ready.open_variables?`${ready.open_variables} material variable${ready.open_variables===1?'':'s'} mapped to the call`:'Diagnostic state',icon:'target',
    body:`<p>${ready.status==='READY'?'Each admitted variable has a primary question and the certification gates passed.':'One or more question-coverage or certification gates remain unresolved.'}</p>`
  };
}
function scoreMarkup(scorecard){
  if(scorecard?.schema_version!=='CLARIS_PRECALL_SCORECARD_V1')return'';
  const fit=scorecard.lead_fit||{},ev=scorecard.evidence_coverage||{},ready=scorecard.call_readiness||{},eq=evidenceLevel(ev.score);
  return `<section class="signal-block instrument-deck panel">
    <div class="instrument-header">
      <div><span class="eyebrow">Decision instruments</span><strong>Three signals. Details only when you ask for them.</strong></div>
      <span class="instrument-live">${icon('radar','mini-icon')} Pre-call state</span>
    </div>
    <div class="signal-row">
      <button class="signal instrument-tile" data-score="fit" aria-expanded="false">
        <span class="signal-label">${icon('spark','small-icon')} Lead fit</span>
        ${gradeGauge(fit.grade)}
        <span class="signal-desc">${esc(fit.grade?fit.descriptor:'Early evaluated signal')}</span>
        <span class="why">Why ${icon('arrow','mini-icon')}</span>
      </button>
      <button class="signal instrument-tile" data-score="evidence" aria-expanded="false">
        <span class="signal-label">${icon('shield','small-icon')} Evidence coverage</span>
        ${gaugeArc({value:Number(ev.score)||0,display:eq.label,caption:'Evidence breadth',tone:'accent',badge:Number.isFinite(Number(ev.score))?`${Math.round(Number(ev.score))}/100`:''})}
        <span class="signal-desc">Source support & diagnostic coverage</span>
        <span class="why">Why ${icon('arrow','mini-icon')}</span>
      </button>
      <button class="signal instrument-tile" data-score="ready" aria-expanded="false">
        <span class="signal-label">${icon('target','small-icon')} Call readiness</span>
        ${readinessGauge(ready)}
        <span class="signal-desc">${esc(ready.open_variables?`${ready.open_variables} material variable${ready.open_variables===1?'':'s'} mapped`:'Diagnostic state')}</span>
        <span class="why">Why ${icon('arrow','mini-icon')}</span>
      </button>
    </div>
    <div class="score-tray panel" data-score-tray hidden></div>
  </section>`;
}

function orientationMarkup(brief,context){
  const meeting=context.meeting_time?new Date(context.meeting_time):null;
  const valid=meeting&&!Number.isNaN(meeting.getTime());
  return `<section class="orientation">
    <div class="orientation-grid">
      <article class="identity-card panel">
        <span class="eyebrow">Brief for the scheduled conversation</span>
        <h1>${esc(context.prospect_name||brief.company)}</h1>
        <p class="role">${icon('briefcase','small-icon')}${esc(context.prospect_role||'Prospect')} <span>at</span> ${esc(brief.company)}</p>
        <div class="identity-meta"><span>${icon('lock','mini-icon')} Private opportunity intelligence</span></div>
      </article>
      <article class="meeting-card panel">
        <span class="eyebrow">${icon('calendar','mini-icon')} The call</span>
        <strong class="call-time">${valid?esc(meeting.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})):'—'}</strong>
        <span class="call-date">${valid?esc(meeting.toLocaleDateString([], {weekday:'short',day:'numeric',month:'short',year:'numeric'})):'Meeting time not attached'}</span>
        ${valid?`<div class="countdown" data-countdown="${esc(meeting.toISOString())}">${icon('timer','mini-icon')}<span>Calculating…</span></div>`:''}
        <div class="call-chips"><span>Private brief</span><span>Pre-call</span></div>
      </article>
    </div>
    ${bookingMarkup(context.booking_text)}
  </section>`;
}
function bookingMarkup(value){
  const raw=text(value);if(!raw)return'';
  const long=raw.length>230;
  return `<details class="booking-row panel" ${long?'':'open'}>
    <summary>
      <span class="booking-icon">${icon('message')}</span>
      <div><span class="eyebrow">Booking request</span><blockquote>${esc(long?excerpt(raw,220):raw)}</blockquote></div>
      <span class="source-chip">Prospect provided</span>
    </summary>
    ${long?`<div class="booking-full">${esc(raw)}</div>`:''}
  </details>`;
}

function knownGoingIn(discovery){
  return arr(discovery?.do_not_ask)
    .filter(x=>x?.reason==='RESEARCH_ALREADY_ANSWERED'&&text(x?.detail))
    .slice(0,5)
    .map(x=>({topic:text(x.topic),detail:text(x.detail)}));
}
const STOP=new Set(['the','and','for','with','that','this','from','into','they','their','have','has','are','was','were','your','you','but','not','can','will','does','about','already','publicly','documents']);
function words(s){return new Set(text(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(w=>w.length>3&&!STOP.has(w)));}
function overlap(a,b){const A=words(a),B=words(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/Math.min(A.size,B.size);}
function contextSignals(prepare,known){
  const knownText=known.map(x=>x.detail);
  return arr(prepare?.signals_that_matter).filter(s=>{
    const source=`${text(s.signal)} ${text(s.observation)}`;
    return !knownText.some(k=>overlap(source,k)>=.55);
  });
}
function contextMarkup(prepare,known){
  const signals=contextSignals(prepare,known),visible=signals.slice(0,3),rest=signals.slice(3);
  const item=s=>`<article class="matter-card panel">
    <div class="matter-head"><span class="truth-badge fact">${icon('fact','mini-icon')} Fact</span><span class="matter-icon">${icon('radar')}</span></div>
    <strong>${esc(s.signal)}</strong>
    <p>${esc(s.observation)}</p>
    <div class="implication"><span>Call implication</span><p>${esc(s.call_implication)}</p></div>
  </article>`;
  return `<div class="matter-grid">${visible.map(item).join('')}</div>
    ${rest.length?`<details class="more-context"><summary>More company context · ${rest.length}</summary><div class="matter-grid secondary">${rest.map(item).join('')}</div></details>`:''}`;
}
function knownMarkup(known){
  if(!known.length)return'';
  return `<aside class="known-strip panel">
    <div class="known-title">${icon('check')}<div><span class="eyebrow">Known going in</span><strong>Don't spend call time rediscovering these.</strong></div></div>
    <div class="known-items">${known.map(x=>`<div class="known-item"><span class="known-check">${icon('check','mini-icon')}</span><span class="known-topic">${esc(x.topic)}</span><strong>${esc(x.detail)}</strong></div>`).join('')}</div>
  </aside>`;
}

function questionMap(discovery){return new Map(arr(discovery?.primary_questions).map(q=>[text(q.question_id),q]));}
function dimensionMap(prepare){return new Map(arr(prepare?.open_dimensions).map(d=>[text(d.dimension_id),d]));}
function questionForStep(step,index,questions){
  const m=text(step?.move).match(/\bQ\d+\b/i);
  if(m)return questions.find(q=>text(q.question_id).toUpperCase()===m[0].toUpperCase())||null;
  return index<questions.length?questions[index]:null;
}
function cleanMove(move,qid){
  let s=text(move);
  if(qid){
    s=s.replace(new RegExp('^Use\\s+'+qid+'\\s+to\\s+','i'),'');
    s=s.replace(new RegExp('\\s+with\\s+'+qid+'\\.?$','i'),'.');
  }
  return s.charAt(0).toUpperCase()+s.slice(1);
}
function blindspotMarkup(prepare,discovery){
  const qByDim=new Map(arr(discovery?.primary_questions).map(q=>[text(q.dimension_id),q]));
  const dims=arr(prepare?.open_dimensions);
  return `<section class="blindspots panel">
    <div class="blindspot-heading">${icon('alert')}<div><span class="eyebrow">Critical blindspots</span><h3>What the call still has to resolve</h3></div></div>
    <div class="blindspot-rail">${dims.map((d,i)=>{
      const q=qByDim.get(text(d.dimension_id));
      return `<article>
        <div class="blindspot-node"><span>${String(i+1).padStart(2,'0')}</span>${icon('alert','mini-icon')}</div>
        <div class="blindspot-copy"><span class="unknown-badge">Unknown</span><strong>${esc(d.label)}</strong><p>${esc(d.why_open)}</p></div>
        ${q?`<a href="#phase-${esc(q.question_id)}">${icon('question','mini-icon')} Resolved by ${esc(q.question_id)}</a>`:''}
      </article>`;
    }).join('')}</div>
  </section>`;
}

function listenMarkup(items,limit=2){
  return `<ul class="listen-list">${arr(items).slice(0,limit).map(x=>`<li>${icon('ear','small-icon')}<div><strong>${esc(x.pattern)}</strong><p>${esc(x.meaning)}</p></div></li>`).join('')}</ul>`;
}
function branchesMarkup(q){
  const probes=arr(q?.conditional_probes);
  const paths=arr(q?.possible_service_paths);
  const context=arr(q?.already_known_context);
  if(!probes.length&&!paths.length&&!context.length&&!text(q?.what_the_answer_changes))return'';
  return `<details class="phase-advanced">
    <summary>${icon('branch','mini-icon')} Advanced branches & answer effects</summary>
    <div class="advanced-body">
      ${context.length?`<section><span class="sub-label">Context already established</span>${context.map(x=>`<p>${esc(x)}</p>`).join('')}</section>`:''}
      ${probes.length?`<section><span class="sub-label">Branch only if triggered</span>${probes.map(p=>`<details class="probe"><summary>${esc(p.trigger_if)}</summary><div><p><b>Ask</b> ${esc(p.ask)}</p><p><b>Why</b> ${esc(p.why)}</p><p><b>What changes</b> ${esc(p.what_changes)}</p></div></details>`).join('')}</section>`:''}
      ${text(q?.what_the_answer_changes)?`<section><span class="sub-label">What this answer changes</span><p>${esc(q.what_the_answer_changes)}</p>${text(q?.stop_condition)?`<p><b>Stop when</b> ${esc(q.stop_condition)}</p>`:''}</section>`:''}
      ${paths.length?`<section class="hypotheses"><span class="sub-label">${icon('hypothesis','mini-icon')} Hypothesis only</span>${paths.map(p=>`<article><strong>${esc(p.display_label||'Possible path if confirmed')} · ${esc(p.service_name||p.service_id)}</strong><p>${esc(p.condition_to_confirm)}</p><small>${esc(p.do_not_assume)}</small></article>`).join('')}</section>`:''}
    </div>
  </details>`;
}
function runCallMarkup(discovery,prepare){
  const questions=arr(discovery?.primary_questions),dims=dimensionMap(prepare),flow=arr(discovery?.call_flow);
  const phaseRefs=flow.map((step,i)=>{
    const q=questionForStep(step,i,questions);
    const id=q?`phase-${q.question_id}`:`phase-${i+1}`;
    return {id,label:cleanMove(step.move,q?.question_id),q};
  });
  return `<div class="run-call panel">
    <nav class="route-strip" aria-label="Call route">
      ${phaseRefs.map((p,i)=>`<a href="#${esc(p.id)}"><span class="route-dot">${String(i+1).padStart(2,'0')}</span><small>${esc(excerpt(p.label,46))}</small></a>`).join('')}
    </nav>
    <div class="call-phases">
    ${flow.map((step,i)=>{
      const q=questionForStep(step,i,questions),dim=q?dims.get(text(q.dimension_id)):null;
      return `<article class="call-phase" id="${q?`phase-${esc(q.question_id)}`:`phase-${i+1}`}">
        <div class="phase-index"><span>${String(i+1).padStart(2,'0')}</span><span class="phase-icon-tile">${icon(q?'target':'arrow')}</span></div>
        <div class="phase-content">
          <div class="phase-heading"><span class="phase-label">${q?'Must establish':'Close the loop'}</span>${dim?`<span class="resolves">${icon('alert','mini-icon')} Resolves · ${esc(dim.label)}</span>`:''}</div>
          <h3>${esc(cleanMove(step.move,q?.question_id))}</h3>
          ${q?`<div class="question-core"><span class="question-kicker">${icon('target','mini-icon')} Ask</span><blockquote>${esc(q.ask)}</blockquote></div>
            <div class="listener-grid">
              <section class="why-tile"><span class="sub-label">${icon('spark','mini-icon')} Why this matters</span><p>${esc(q.why_now)}</p></section>
              <section class="listen-tile"><span class="sub-label">${icon('ear','mini-icon')} Listen for</span>${listenMarkup(q.listen_for)}</section>
            </div>
            ${branchesMarkup(q)}`:
            `<p class="phase-close">${esc(step.advance_when)}</p>`}
          ${q&&text(step.advance_when)?`<details class="done-when"><summary>${icon('check','mini-icon')} Done when</summary><p>${esc(step.advance_when)}</p></details>`:''}
        </div>
      </article>`;
    }).join('')}
    </div>
  </div>`;
}

function nextMoveMarkup(scorecard,discovery){
  const action=text(scorecard?.strategy?.recommended_action)||'Agree the next scoped action once the open variables are resolved.';
  const gate=discovery?.end_of_call_decision||{};
  return `<article class="next-move">
    <div class="decision-icon">${icon('arrow')}</div>
    <div><span class="truth-badge decision">Decision</span><span class="eyebrow">Conditional next move</span><strong>${esc(action)}</strong>
      <details><summary>Decision conditions</summary><div class="decision-conditions">
        <section><h4>Advance if</h4><ul>${arr(gate.ready_for_next_step_if).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>
        <section><h4>Keep diagnosing if</h4><ul>${arr(gate.remain_in_discovery_if).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>
        <section><h4>Only deprioritize if</h4><ul>${arr(gate.disqualify_or_deprioritize_if).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>
      </div></details>
    </div>
  </article>`;
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
    <summary><div>${icon('file')}<span><span class="eyebrow">Audit layer</span><strong>Evidence & sources</strong></span></div><small>${totalObs} observations · ${totalPages} pages</small><span class="inspect">Inspect ${icon('arrow','mini-icon')}</span></summary>
    <div class="proof-body">
      <div class="proof-tabs"><button class="is-active" data-proof-tab="evidence">Evidence</button><button data-proof-tab="reasoning">Reasoning</button><button data-proof-tab="unknowns">Unknowns</button></div>
      <div class="proof-panel is-active" data-proof-panel="evidence"><div class="source-pills">${groups.map((g,i)=>`<button class="source-pill${i===0?' is-active':''}" data-source="${esc(g.key)}">${icon('link','mini-icon')}<strong>${esc(g.key)}</strong><span>${g.claims.length} obs</span></button>`).join('')}</div><div class="source-tray" data-source-tray></div></div>
      <div class="proof-panel" data-proof-panel="reasoning">${arr(prepare?.expandable_blocks?.reasoning).map(r=>`<details class="audit-item"><summary>${esc(r.title)}</summary><div><p>${esc(r.observation)}</p><p><b>Premises</b> ${esc(arr(r.premises).join(' · '))}</p><p><b>Not a claim of</b> ${esc(arr(r.not_a_claim_of).join(' · '))}</p></div></details>`).join('')}</div>
      <div class="proof-panel" data-proof-panel="unknowns">${arr(prepare?.expandable_blocks?.unknowns).map(u=>`<details class="audit-item"><summary>${esc(u.title)}</summary><div><p><b>Why unknown</b> ${esc(u.why_unknown)}</p><p><b>What resolves it</b> ${esc(u.what_would_resolve_it)}</p></div></details>`).join('')}</div>
    </div>
  </details>`;
}

function render(brief){
  const prepare=brief?.payload?.prepare||{},discovery=brief?.payload?.discovery||{},scorecard=brief?.payload?.scorecard||null,context=brief?.context||{};
  const known=knownGoingIn(discovery),groups=sourceIndex(prepare);
  root.innerHTML=`
    <header class="topbar"><a class="brand" href="#top">${icon('spark','brand-icon')}<span>CLARIS</span></a><nav class="segmented-nav"><a href="#matters">${icon('radar','mini-icon')} What matters</a><a href="#run">${icon('route','mini-icon')} Run the call</a><a href="#next">${icon('arrow','mini-icon')} Next move</a><a href="#evidence">${icon('file','mini-icon')} Evidence</a></nav><span class="private">${icon('lock','mini-icon')} Private · expires ${esc(new Date(brief.expires_at).toLocaleDateString())}</span></header>
    <div id="top">${orientationMarkup(brief,context)}</div>

    <section class="section overview">
      <div class="section-head compact"><span class="eyebrow">At a glance</span><h2>Opportunity signal</h2></div>
      ${scoreMarkup(scorecard)}
      <article class="call-focus panel"><div class="focus-icon">${icon('target')}</div><div><span class="eyebrow">Call focus</span><h2>${esc(discovery.call_objective||prepare?.call_strategy?.opening_move||'Run a focused diagnostic conversation.')}</h2>${prepare.executive_readout?`<details><summary>Working model</summary><p>${esc(prepare.executive_readout)}</p></details>`:''}</div></article>
    </section>

    <section id="matters" class="section">
      <div class="section-head"><div><span class="eyebrow">What matters</span><h2>Only what should change your behaviour on the call</h2></div><p>Fact first. Interpretation second. Everything else stays in evidence.</p></div>
      ${contextMarkup(prepare,known)}
      ${knownMarkup(known)}
      ${blindspotMarkup(prepare,discovery)}
    </section>

    <section id="run" class="section run-section">
      <div class="section-head"><div><span class="eyebrow">Run the call</span><h2>One executable mental model</h2></div><p>The question, what to listen for, and the branch logic live in the same place.</p></div>
      ${runCallMarkup(discovery,prepare)}
    </section>

    <section id="next" class="section"><div class="section-head compact"><span class="eyebrow">Next move</span><h2>Conditional decision</h2></div>${nextMoveMarkup(scorecard,discovery)}</section>
    <section id="evidence" class="section evidence-section">${proofMarkup(prepare,groups)}</section>
  `;
  bindScore(scorecard);bindCountdown();bindProof(groups);
}

function bindScore(scorecard){
  if(scorecard?.schema_version!=='CLARIS_PRECALL_SCORECARD_V1')return;
  const tray=root.querySelector('[data-score-tray]'),buttons=[...root.querySelectorAll('[data-score]')];
  buttons.forEach(button=>button.addEventListener('click',()=>{
    const open=button.getAttribute('aria-expanded')==='true';
    buttons.forEach(b=>{b.setAttribute('aria-expanded','false');b.classList.remove('is-active');});
    if(open){tray.hidden=true;tray.innerHTML='';return;}
    button.setAttribute('aria-expanded','true');button.classList.add('is-active');
    const d=scoreDetail(button.dataset.score,scorecard);
    tray.innerHTML=`<div class="score-tray-head">${icon(d.icon)}<div><span class="eyebrow">${esc(d.title)}</span><h3>${esc(d.answer)} · ${esc(d.descriptor)}</h3></div></div>${d.body}`;
    tray.hidden=false;
  }));
}
function bindCountdown(){
  const node=root.querySelector('[data-countdown]');if(!node)return;
  const target=new Date(node.dataset.countdown).getTime();if(!Number.isFinite(target))return;
  const update=()=>{const diff=target-Date.now(),mins=Math.floor(Math.abs(diff)/60000);const d=Math.floor(mins/1440),h=Math.floor((mins%1440)/60),m=mins%60;const span=[d?`${d}d`:null,(d||h)?`${h}h`:null,`${m}m`].filter(Boolean).join(' ');node.querySelector('span').textContent=diff>=0?`Starts in ${span}`:`Started ${span} ago`;};
  update();setInterval(update,60000);
}
function bindProof(groups){
  const map=new Map(groups.map(g=>[g.key,g])),tray=root.querySelector('[data-source-tray]');
  const show=key=>{const g=map.get(key);if(!g||!tray)return;tray.innerHTML=`<div class="source-head"><div><span class="eyebrow">Source</span><h3>${esc(g.key)}</h3></div><small>${g.claims.length} observations · ${g.pages.length} pages</small></div><div class="source-grid"><section><span class="sub-label">Accepted observations</span><ul>${g.claims.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section><section><span class="sub-label">Used to support</span><p>${esc(g.used.join(' · ')||'Bounded call preparation.')}</p><span class="sub-label">Not used to infer</span><p>${esc(g.notUsed.join(' · ')||'No unsupported conclusion.')}</p></section></div><div class="source-links">${g.pages.map(p=>`<a href="${safeUrl(p.url)}" target="_blank" rel="noopener noreferrer">${icon('link','mini-icon')}${esc(p.supports||p.url)}</a>`).join('')}</div>`;};
  const pills=[...root.querySelectorAll('[data-source]')];pills.forEach(b=>b.addEventListener('click',()=>{pills.forEach(x=>x.classList.toggle('is-active',x===b));show(b.dataset.source);}));if(groups[0])show(groups[0].key);
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
