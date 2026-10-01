const root=document.getElementById('brief-root');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const text=v=>String(v??'').trim();
const uniq=xs=>[...new Set(xs.map(text).filter(Boolean))];
const safeUrl=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
const titleCase=value=>text(value).toLowerCase().replace(/(^|\s)\S/g,m=>m.toUpperCase());

function tokenFromFragment(){const raw=location.hash.startsWith('#')?location.hash.slice(1):'';return String(new URLSearchParams(raw).get('brief')||'').trim()||null;}
function clearFragment(){history.replaceState(null,document.title,location.pathname+location.search);}
async function requestJson(url,options={}){const {headers={},...rest}=options;const r=await fetch(url,{...rest,credentials:'same-origin',headers:{'Content-Type':'application/json',...headers}});let body=null;try{body=await r.json();}catch{}return{ok:r.ok,status:r.status,body};}
function gate(title,detail){root.innerHTML=`<section class="gate surface"><div class="eyebrow">CLARIS · Private Opportunity Intelligence</div><h1>${esc(title)}</h1><p>${esc(detail)}</p></section>`;}
function readableTime(value){const raw=text(value);if(!raw)return null;const d=new Date(raw);return Number.isNaN(d.getTime())?raw:d.toLocaleString([], {dateStyle:'medium',timeStyle:'short'});}
function hostname(url){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return 'Source';}}
function statusTone(status){if(['MATCH','COMPLETE','READY'].includes(status))return'good';if(['PARTIAL_MATCH','PARTIAL','WEAK'].includes(status))return'partial';if(['MISMATCH','MISSING','NOT_READY'].includes(status))return'bad';return'unknown';}
function evidenceHeadline(descriptor){return text(descriptor).replace(/\s+evidence basis$/i,'')||'Not assessed';}
function excerpt(value,max=190){const raw=text(value);if(raw.length<=max)return raw;const cut=raw.slice(0,max);const boundary=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('; '),cut.lastIndexOf(', '),cut.lastIndexOf(' '));return raw.slice(0,boundary>110?boundary:max).trim()+'…';}

function scoreDimensions(items){
  return arr(items).map(item=>`<li>
    <div><strong>${esc(item.label)}</strong><p>${esc(item.reason)}</p></div>
    <span class="status ${statusTone(item.status)}">${esc(text(item.status).replaceAll('_',' '))}</span>
  </li>`).join('');
}

function scorecardMarkup(scorecard){
  if(scorecard?.schema_version!=='CLARIS_PRECALL_SCORECARD_V1'){
    return `<section class="decision-signals" aria-label="Decision signals">
      <div class="signal-metric"><span>Lead fit</span><strong>—</strong><p>Not yet scored</p></div>
      <div class="signal-metric"><span>Evidence coverage</span><strong>—</strong><p>Not yet assessed</p></div>
      <div class="signal-metric"><span>Call readiness</span><strong>—</strong><p>Not yet assessed</p></div>
    </section>`;
  }

  const fit=scorecard.lead_fit||{}, evidence=scorecard.evidence_coverage||{}, ready=scorecard.call_readiness||{};
  return `<section class="decision-signals" aria-label="Decision signals">
    <details class="signal-metric">
      <summary>
        <span>Lead fit</span>
        <strong class="grade">${esc(fit.grade||'—')}</strong>
        <p>${esc(fit.grade?fit.descriptor:'Early evaluated signal')}</p>
        <small>Why</small>
      </summary>
      <div class="signal-detail">
        <p class="audit-note">${fit.grade
          ? `${esc(fit.scorable_coverage??0)} of 100 weighted fit criteria are currently scorable.`
          : `Only ${esc(fit.scorable_coverage??0)} of 100 weighted fit criteria are currently scorable, so CLARIS suppresses the letter grade.`}</p>
        <ul class="dimension-list">${scoreDimensions(fit.dimensions)}</ul>
      </div>
    </details>

    <details class="signal-metric">
      <summary>
        <span>Evidence coverage</span>
        <strong>${esc(evidenceHeadline(evidence.descriptor))}</strong>
        <p>Source quality and diagnostic coverage</p>
        <small>Why</small>
      </summary>
      <div class="signal-detail">
        <p class="audit-note">Deterministic evidence score: ${esc(evidence.score??'—')} / 100. The number is kept in the audit layer rather than the headline.</p>
        <ul class="dimension-list">${scoreDimensions(evidence.dimensions)}</ul>
      </div>
    </details>

    <details class="signal-metric">
      <summary>
        <span>Call readiness</span>
        <strong class="readiness ${ready.status==='READY'?'good-text':''}">${esc(titleCase(ready.status||'—'))}</strong>
        <p>${ready.open_variables?esc(`${ready.open_variables} material variable${ready.open_variables===1?'':'s'} mapped to discovery`):'Diagnostic state'}</p>
        <small>Why</small>
      </summary>
      <div class="signal-detail">
        <p class="audit-note">${ready.status==='READY'
          ? 'Each admitted variable has a primary question and the publication gates passed.'
          : 'One or more question-coverage or certification gates remain unresolved.'}</p>
      </div>
    </details>
  </section>`;
}

function bookingMarkup(value){
  const raw=text(value); if(!raw)return'';
  if(raw.length<=220){
    return `<section class="booking-request"><div class="section-label-row"><span class="eyebrow">Booking request</span><span class="source-tag">Prospect provided</span></div><blockquote>${esc(raw)}</blockquote></section>`;
  }
  return `<details class="booking-request">
    <summary>
      <div class="section-label-row"><span class="eyebrow">Booking request</span><span class="source-tag">Prospect provided</span></div>
      <blockquote>${esc(excerpt(raw))}</blockquote>
      <span class="read-more">Read full request</span>
    </summary>
    <div class="booking-full">${esc(raw)}</div>
  </details>`;
}

function knownGoingIn(discovery){
  const direct=arr(discovery?.do_not_ask)
    .filter(x=>x?.reason==='RESEARCH_ALREADY_ANSWERED')
    .map(x=>({title:text(x.topic),detail:text(x.detail)}));
  const context=uniq(arr(discovery?.primary_questions).flatMap(q=>arr(q?.already_known_context)))
    .map(detail=>({title:'Established context',detail}));
  const seen=new Set(), result=[];
  for(const item of [...direct,...context]){
    const key=item.detail.toLowerCase();
    if(!item.detail||seen.has(key))continue;
    seen.add(key); result.push(item);
    if(result.length>=5)break;
  }
  return result;
}

function sourceIndex(prepare){
  const groups=new Map();
  for(const evidence of arr(prepare?.expandable_blocks?.evidence)){
    for(const source of arr(evidence?.sources)){
      const url=safeUrl(source?.url); if(url==='#')continue;
      const key=hostname(url);
      if(!groups.has(key))groups.set(key,{key,claims:[],used:[],notUsed:[],pages:[]});
      const g=groups.get(key);
      g.claims.push(...arr(evidence.claims));
      g.used.push(...arr(evidence.used_for));
      g.notUsed.push(...arr(evidence.not_used_for));
      g.pages.push({url,supports:text(source.supports)});
    }
  }
  return [...groups.values()].map(g=>({
    ...g,
    claims:uniq(g.claims),used:uniq(g.used),notUsed:uniq(g.notUsed),
    pages:[...new Map(g.pages.map(p=>[p.url,p])).values()]
  }));
}

function companyContext(signals){
  return arr(signals).slice(0,4).map(s=>`<article class="context-row">
    <div class="context-fact">
      <span class="sub-label">Signal</span>
      <strong>${esc(s.signal)}</strong>
      <p>${esc(s.observation)}</p>
    </div>
    <div class="context-implication">
      <span class="sub-label">Why it matters here</span>
      <p>${esc(s.call_implication)}</p>
    </div>
  </article>`).join('');
}

function mentalModelMarkup(known,unresolved){
  return `<div class="mental-model surface">
    <section class="known-column">
      <div class="column-heading"><span class="eyebrow">Known going in</span><span class="count">${known.length}</span></div>
      <p class="column-intro">What you can safely behave as though you already know.</p>
      <ul class="mental-list">${known.length?known.map(x=>`<li><strong>${esc(x.detail)}</strong><small>${esc(x.title)}</small></li>`).join(''):'<li><strong>No compact established-context projection is available yet.</strong></li>'}</ul>
    </section>
    <section class="unknown-column">
      <div class="column-heading"><span class="eyebrow">Still unresolved</span><span class="count">${unresolved.length}</span></div>
      <p class="column-intro">What this conversation still needs to establish.</p>
      <ul class="mental-list unresolved-list">${unresolved.map(x=>`<li><strong>${esc(x.label)}</strong><small>${esc(x.why_open)}</small></li>`).join('')}</ul>
    </section>
  </div>`;
}

function conversationPath(flow,strategy){
  return `<div class="run-show surface">
    ${arr(strategy?.first_10_minutes).length?`<div class="first-ten">
      <span class="eyebrow">First 10 minutes</span>
      <ol>${arr(strategy.first_10_minutes).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>
    </div>`:''}
    <ol class="path-list">${arr(flow).map(x=>`<li>
      <span class="step-number">${String(x.step).padStart(2,'0')}</span>
      <div class="step-copy"><strong>${esc(x.move)}</strong><p><span>Advance when</span> ${esc(x.advance_when)}</p></div>
    </li>`).join('')}</ol>
  </div>`;
}

function listenForMarkup(items){
  return `<ul class="listen-list">${arr(items).map(x=>`<li>
    <strong>${esc(x.pattern)}</strong>
    <p>${esc(x.meaning)}</p>
    ${x.next_effect?`<small>Then · ${esc(x.next_effect)}</small>`:''}
  </li>`).join('')}</ul>`;
}

function questionMarkup(q,index){
  const branches=arr(q.conditional_probes).map(p=>`<details class="branch">
    <summary>${esc(p.trigger_if)}</summary>
    <div class="branch-body">
      <p><span>Ask</span> ${esc(p.ask)}</p>
      <p><span>Why</span> ${esc(p.why)}</p>
      <p><span>Listen for</span> ${esc(arr(p.listen_for).join(' · '))}</p>
      <p><span>What changes</span> ${esc(p.what_changes)}</p>
    </div>
  </details>`).join('');
  const services=arr(q.linked_service_paths).map(s=>`<li>${esc(s.condition)}</li>`).join('');

  return `<details class="question">
    <summary>
      <span class="qnum">${String(index+1).padStart(2,'0')}</span>
      <strong>${esc(q.ask)}</strong>
      <span class="expand-word">Open</span>
    </summary>
    <div class="question-body">
      <div class="question-primary">
        <section>
          <span class="sub-label">Why this matters</span>
          <p>${esc(q.why_now)}</p>
        </section>
        <section>
          <span class="sub-label">Known context · don't re-ask</span>
          ${arr(q.already_known_context).map(x=>`<p>${esc(x)}</p>`).join('')}
        </section>
      </div>

      <section class="listen">
        <span class="sub-label">Listen for</span>
        ${listenForMarkup(q.listen_for)}
      </section>

      <details class="advanced">
        <summary>Branches & answer effects</summary>
        <div class="advanced-body">
          ${branches?`<div class="branches"><span class="sub-label">Branch only when earned</span>${branches}</div>`:''}
          <div class="answer-effect">
            <span class="sub-label">What this answer changes</span>
            <p>${esc(q.what_the_answer_changes)}</p>
            <p><strong>Stop when:</strong> ${esc(q.stop_condition)}</p>
            ${services?`<ul class="service-conditions">${services}</ul>`:''}
          </div>
        </div>
      </details>
    </div>
  </details>`;
}

function reasoningMarkup(prepare){
  return arr(prepare?.expandable_blocks?.reasoning).map(r=>`<details class="proof-item">
    <summary><strong>${esc(r.title)}</strong></summary>
    <div class="proof-body"><p>${esc(r.observation)}</p><h5>Premises</h5><ul>${arr(r.premises).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h5>Not a claim of</h5><p>${esc(arr(r.not_a_claim_of).join(' · '))}</p></div>
  </details>`).join('');
}

function unknownMarkup(prepare){
  return arr(prepare?.expandable_blocks?.unknowns).map(u=>`<details class="proof-item">
    <summary><strong>${esc(u.title)}</strong></summary>
    <div class="proof-body"><p><b>Why unknown</b> ${esc(u.why_unknown)}</p><p><b>What resolves it</b> ${esc(u.what_would_resolve_it)}</p><p><b>Blocked conclusions</b> ${esc(arr(u.blocked_conclusions).join(' · '))}</p></div>
  </details>`).join('');
}

function proofTray(groups){
  if(!groups.length)return'<p class="empty-copy">No public-evidence sources were attached to this brief.</p>';
  const totalObs=groups.reduce((sum,g)=>sum+g.claims.length,0);
  const totalPages=groups.reduce((sum,g)=>sum+g.pages.length,0);
  return `<div class="source-overview"><strong>Company sources</strong><span>${totalObs} accepted observations · ${totalPages} pages</span></div>
  <div class="source-pills">${groups.map((g,i)=>`<button type="button" class="source-pill${i===0?' is-active':''}" data-source="${esc(g.key)}"><strong>${esc(g.key)}</strong><span>${g.claims.length} obs · ${g.pages.length} page${g.pages.length===1?'':'s'}</span></button>`).join('')}</div>
  <div class="source-tray" data-source-tray></div>`;
}

function render(brief){
  const prepare=brief?.payload?.prepare||{}, discovery=brief?.payload?.discovery||{}, scorecard=brief?.payload?.scorecard||null, context=brief?.context||{};
  const heading=context.prospect_name||brief.company;
  const known=knownGoingIn(discovery);
  const unresolved=arr(prepare.open_dimensions);
  const groups=sourceIndex(prepare);
  const strategy=prepare.call_strategy||{};
  const ready=arr(discovery?.end_of_call_decision?.ready_for_next_step_if);
  const hold=arr(discovery?.end_of_call_decision?.remain_in_discovery_if);
  const stop=arr(discovery?.end_of_call_decision?.disqualify_or_deprioritize_if);
  const dontAsk=uniq([...arr(strategy.avoid_early),...arr(discovery.do_not_ask).map(x=>x?.detail||x?.topic)]).slice(0,8);
  const nextAction=text(scorecard?.strategy?.recommended_action);
  const meetingDate=context.meeting_time?new Date(context.meeting_time):null;
  const meetingValid=meetingDate&&!Number.isNaN(meetingDate.getTime());

  root.innerHTML=`
    <header class="topbar">
      <div class="brand">CLARIS</div>
      <nav class="stage-nav" aria-label="Brief sections">
        <a href="#orient">Orient</a><a href="#understand">Understand</a><a href="#prepare">Prepare</a><a href="#advance">Advance</a><a href="#prove">Prove</a>
      </nav>
      <div class="expiry">Private brief · expires ${esc(new Date(brief.expires_at).toLocaleDateString())}</div>
    </header>

    <section id="orient" class="hero">
      <div class="identity">
        <span class="eyebrow">Brief for the scheduled conversation</span>
        <h1>${esc(heading)}</h1>
        <p>${esc(context.prospect_role||'Prospect')} <span>at</span> ${esc(brief.company)}</p>
      </div>
      <div class="meeting-instrument">
        <span class="eyebrow">The call</span>
        <strong>${meetingValid?esc(meetingDate.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})):'—'}</strong>
        <p>${meetingValid?esc(meetingDate.toLocaleDateString([], {weekday:'short',day:'numeric',month:'short',year:'numeric'})):'Meeting time not attached'}</p>
      </div>
    </section>

    ${bookingMarkup(context.booking_text)}

    <section class="brief-stage">
      <div class="stage-heading"><span class="eyebrow">Decide what matters</span><h2>Opportunity signal</h2></div>
      ${scorecardMarkup(scorecard)}

      <article class="call-focus surface">
        <span class="eyebrow">Call focus</span>
        <h2>${esc(discovery.call_objective||strategy.opening_move||'Run a focused diagnostic conversation.')}</h2>
        ${prepare.executive_readout?`<details class="working-model"><summary>Working model</summary><p>${esc(prepare.executive_readout)}</p></details>`:''}
      </article>
    </section>

    <section id="understand" class="brief-stage">
      <div class="stage-heading"><span class="eyebrow">Understand</span><h2>Company & risk context</h2><p>Only the context that should change how you run this call.</p></div>
      <div class="company-context">${companyContext(prepare.signals_that_matter)}</div>

      <div class="stage-heading compact"><h2>Known vs unresolved</h2></div>
      ${mentalModelMarkup(known,unresolved)}
    </section>

    <section id="prepare" class="brief-stage">
      <div class="stage-heading"><span class="eyebrow">Prepare</span><h2>Conversation path</h2><p>${esc(strategy.opening_move||'Use known context to skip redundant discovery.')}</p></div>
      ${conversationPath(discovery.call_flow,strategy)}

      <div class="stage-heading questions-heading"><h2>Questions to carry</h2><p>Scan the questions first. Open only the intelligence you need.</p></div>
      <div class="questions">${arr(discovery.primary_questions).map(questionMarkup).join('')}</div>
    </section>

    <section id="advance" class="brief-stage">
      <div class="stage-heading"><span class="eyebrow">Advance</span><h2>Decision gate</h2></div>
      <article class="next-move">
        <span>Recommended next move</span>
        <strong>${esc(nextAction||'Agree the next scoped action with the prospect')}</strong>
      </article>
      <div class="decision-logic">
        <section><span class="decision-icon">✓</span><div><h3>Ready to advance when</h3><ul>${ready.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></section>
        <section><span class="decision-icon">→</span><div><h3>Keep discovering if</h3><ul>${hold.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></section>
        <section><span class="decision-icon">×</span><div><h3>Deprioritize only if</h3><ul>${stop.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></section>
      </div>

      <aside class="dont-waste"><strong>Don't waste the call on</strong><div>${dontAsk.map(x=>`<span>${esc(x)}</span>`).join('')}</div></aside>
    </section>

    <section id="prove" class="brief-stage">
      <details class="proof-shell">
        <summary>
          <div><span class="eyebrow">Prove</span><h2>Proof & sources</h2></div>
          <p>${arr(prepare?.expandable_blocks?.evidence).length} evidence blocks · ${arr(prepare?.expandable_blocks?.reasoning).length} reasoning notes · ${arr(prepare?.expandable_blocks?.unknowns).length} unresolved items</p>
          <span class="proof-open">Inspect</span>
        </summary>
        <div class="proof-content">
          <div class="proof-tabs" role="tablist">
            <button class="is-active" data-proof-tab="evidence">Evidence</button>
            <button data-proof-tab="reasoning">Reasoning</button>
            <button data-proof-tab="unknowns">Unknowns</button>
          </div>
          <div class="proof-panel is-active" data-proof-panel="evidence">${proofTray(groups)}</div>
          <div class="proof-panel" data-proof-panel="reasoning">${reasoningMarkup(prepare)}</div>
          <div class="proof-panel" data-proof-panel="unknowns">${unknownMarkup(prepare)}</div>
        </div>
      </details>
    </section>
  `;

  bindProof(groups);
}

function bindProof(groups){
  const groupMap=new Map(groups.map(g=>[g.key,g]));
  const tray=root.querySelector('[data-source-tray]');
  const renderTray=key=>{
    const g=groupMap.get(key); if(!g||!tray)return;
    tray.innerHTML=`<div class="source-tray-head"><div><span class="sub-label">Source</span><h3>${esc(g.key)}</h3></div><small>${g.claims.length} observations · ${g.pages.length} pages</small></div>
      <div class="source-tray-grid">
        <div><span class="sub-label">Accepted observations</span><ul>${g.claims.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><span class="sub-label">Used to support</span><p>${esc(g.used.join(' · ')||'Bounded call preparation.')}</p><span class="sub-label">Explicitly not used to infer</span><p>${esc(g.notUsed.join(' · ')||'No unsupported conclusion.')}</p></div>
      </div>
      <div class="source-links">${g.pages.map(p=>`<a href="${safeUrl(p.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(p.supports||p.url)}</span><b>↗</b></a>`).join('')}</div>`;
  };
  const sourceButtons=[...root.querySelectorAll('[data-source]')];
  sourceButtons.forEach(button=>button.addEventListener('click',()=>{
    sourceButtons.forEach(b=>b.classList.toggle('is-active',b===button));
    renderTray(button.dataset.source);
  }));
  if(groups[0])renderTray(groups[0].key);

  const tabs=[...root.querySelectorAll('[data-proof-tab]')];
  tabs.forEach(button=>button.addEventListener('click',()=>{
    tabs.forEach(b=>b.classList.toggle('is-active',b===button));
    root.querySelectorAll('[data-proof-panel]').forEach(panel=>panel.classList.toggle('is-active',panel.dataset.proofPanel===button.dataset.proofTab));
  }));
}

async function boot(){
  const gateway='/api/delivery/package';
  const token=tokenFromFragment();
  if(token){
    clearFragment();
    const resolved=await requestJson(gateway,{method:'POST',headers:{'X-Claris-Delivery':'brief_resolve'},body:JSON.stringify({brief_token:token})});
    if(!resolved.ok){gate('This private brief could not be opened.',resolved.status===410?'The link expired or was revoked.':'Request a fresh CLARIS brief link.');return;}
  }
  const loaded=await requestJson(gateway,{method:'POST',headers:{'X-Claris-Delivery':'brief_data'},body:JSON.stringify({})});
  if(!loaded.ok){gate('A private brief link is required.',loaded.status===410?'This brief expired or was revoked.':'Open the CLARIS link you received to view this brief.');return;}
  render(loaded.body.brief);
}
boot().catch(()=>gate('This private brief could not be opened.','A network or server error occurred. Request a fresh CLARIS brief link.'));
