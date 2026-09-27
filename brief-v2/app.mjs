const root=document.getElementById('brief-root');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const text=v=>String(v??'').trim();
const uniq=xs=>[...new Set(xs.map(text).filter(Boolean))];
const safeUrl=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function tokenFromFragment(){const raw=location.hash.startsWith('#')?location.hash.slice(1):'';return String(new URLSearchParams(raw).get('brief')||'').trim()||null;}
function clearFragment(){history.replaceState(null,document.title,location.pathname+location.search);}
async function requestJson(url,options={}){const {headers={},...rest}=options;const r=await fetch(url,{...rest,credentials:'same-origin',headers:{'Content-Type':'application/json',...headers}});let body=null;try{body=await r.json();}catch{}return{ok:r.ok,status:r.status,body};}
function gate(title,detail){root.innerHTML=`<section class="gate glass"><div class="eyebrow">CLARIS · Private Opportunity Intelligence</div><h1>${esc(title)}</h1><p>${esc(detail)}</p></section>`;}
function readableTime(value){const raw=text(value);if(!raw)return null;const d=new Date(raw);return Number.isNaN(d.getTime())?raw:d.toLocaleString([], {dateStyle:'medium',timeStyle:'short'});}
function hostname(url){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return 'Source';}}
function percent(v){return Number.isFinite(Number(v))?`${Math.round(Number(v))}%`:'—';}
function scoreArc(value){const n=clamp(Number(value)||0,0,100);return `<div class="score-ring" style="--score:${n}"><span>${Math.round(n)}</span></div>`;}
function statusTone(status){if(['MATCH','COMPLETE','READY'].includes(status))return'good';if(['PARTIAL_MATCH','PARTIAL','WEAK'].includes(status))return'partial';if(['MISMATCH','MISSING','NOT_READY'].includes(status))return'bad';return'unknown';}

function scoreDimensions(items){
  return arr(items).map(item=>`<li>
    <span class="dimension-label">${esc(item.label)}</span>
    <span class="status ${statusTone(item.status)}">${esc(item.status.replaceAll('_',' '))}</span>
    <p>${esc(item.reason)}</p>
    ${arr(item.basis_ids).length?`<small>Basis · ${esc(item.basis_ids.join(' · '))}</small>`:''}
  </li>`).join('');
}

function scorecardMarkup(scorecard){
  if(scorecard?.schema_version!=='CLARIS_PRECALL_SCORECARD_V1'){
    return `<section class="glance glass">
      <div class="glance-head"><div><span class="section-kicker">At a glance</span><h2>Commercial signal layer</h2></div><span class="quiet-badge">Score basis not attached</span></div>
      <div class="glance-grid pending">
        <article><span class="metric-label">Lead fit</span><strong>—</strong><p>Awaiting governed scoring basis.</p></article>
        <article><span class="metric-label">Evidence coverage</span><strong>—</strong><p>The certified brief remains usable without a scorecard.</p></article>
        <article><span class="metric-label">Call readiness</span><strong>—</strong><p>Readiness appears when the scorecard is compiled.</p></article>
      </div>
    </section>`;
  }
  const fit=scorecard.lead_fit||{}, evidence=scorecard.evidence_coverage||{}, ready=scorecard.call_readiness||{};
  return `<section class="glance glass">
    <div class="glance-head"><div><span class="section-kicker">At a glance</span><h2>Decision signals</h2></div><span class="quiet-badge">Deterministic · traceable</span></div>
    <div class="glance-grid">
      <details class="metric-card">
        <summary>
          <span class="metric-label">Lead fit</span>
          <div class="metric-visual grade"><strong>${esc(fit.grade||'—')}</strong><span>${percent(fit.evaluated_fit_rate)}</span></div>
          <p>${esc(fit.descriptor||'Not yet scorable')}</p>
          <small>${esc(fit.scorable_coverage??0)} / 100 fit points currently scorable · Why ↘</small>
        </summary>
        <div class="metric-detail"><ul class="dimension-list">${scoreDimensions(fit.dimensions)}</ul></div>
      </details>
      <details class="metric-card">
        <summary>
          <span class="metric-label">Evidence coverage</span>
          <div class="metric-visual">${scoreArc(evidence.score)}</div>
          <p>${esc(evidence.descriptor||'Evidence basis')}</p>
          <small>Authority · corroboration · freshness · conflict control · Why ↘</small>
        </summary>
        <div class="metric-detail"><ul class="dimension-list">${scoreDimensions(evidence.dimensions)}</ul></div>
      </details>
      <details class="metric-card">
        <summary>
          <span class="metric-label">Call readiness</span>
          <div class="readiness-state ${ready.status==='READY'?'is-ready':''}">${esc(ready.status||'—')}</div>
          <p>${ready.open_variables?esc(`${ready.open_variables} open variable${ready.open_variables===1?'':'s'} mapped to discovery`):'Certified diagnostic state'}</p>
          <small>${ready.certified?'All semantic + deterministic gates passed':'Certification incomplete'} · Why ↘</small>
        </summary>
        <div class="metric-detail"><p class="detail-copy">${ready.status==='READY'?'Every admitted dimension has a primary question and the publication certification is green.':'One or more certification or question-coverage gates remain unresolved.'}</p></div>
      </details>
    </div>
  </section>`;
}

function knownGoingIn(discovery){
  const direct=arr(discovery?.do_not_ask)
    .filter(x=>x?.reason==='RESEARCH_ALREADY_ANSWERED')
    .map(x=>({title:text(x.topic),detail:text(x.detail)}));
  const context=uniq(arr(discovery?.primary_questions).flatMap(q=>arr(q?.already_known_context)))
    .map((detail,i)=>({title:`Established context ${i+1}`,detail}));
  const seen=new Set(), result=[];
  for(const item of [...direct,...context]){
    const key=item.detail.toLowerCase();
    if(!item.detail||seen.has(key))continue;
    seen.add(key); result.push(item);
    if(result.length>=4)break;
  }
  return result;
}

function sourceIndex(prepare){
  const groups=new Map();
  for(const evidence of arr(prepare?.expandable_blocks?.evidence)){
    for(const source of arr(evidence?.sources)){
      const url=safeUrl(source?.url);
      if(url==='#')continue;
      const key=hostname(url);
      if(!groups.has(key))groups.set(key,{key,claims:[],used:[],notUsed:[],pages:[],evidenceIds:[]});
      const g=groups.get(key);
      g.claims.push(...arr(evidence.claims));
      g.used.push(...arr(evidence.used_for));
      g.notUsed.push(...arr(evidence.not_used_for));
      g.pages.push({url,supports:text(source.supports)});
      g.evidenceIds.push(text(evidence.id));
    }
  }
  return [...groups.values()].map(g=>({
    ...g,
    claims:uniq(g.claims),used:uniq(g.used),notUsed:uniq(g.notUsed),
    evidenceIds:uniq(g.evidenceIds),
    pages:[...new Map(g.pages.map(p=>[p.url,p])).values()]
  }));
}

function proofTray(groups){
  if(!groups.length)return'<p class="empty-copy">No public-evidence sources were attached to this brief.</p>';
  return `<div class="source-pills">${groups.map((g,i)=>`<button type="button" class="source-pill${i===0?' is-active':''}" data-source="${esc(g.key)}"><strong>${esc(g.key)}</strong><span>${g.claims.length} obs · ${g.pages.length} page${g.pages.length===1?'':'s'}</span></button>`).join('')}</div>
  <div class="source-tray" data-source-tray></div>`;
}

function reasoningMarkup(prepare){
  return arr(prepare?.expandable_blocks?.reasoning).map(r=>`<details class="proof-item">
    <summary><span>${esc(r.id)}</span><strong>${esc(r.title)}</strong></summary>
    <div class="proof-body"><p>${esc(r.observation)}</p><h5>Premises</h5><ul>${arr(r.premises).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h5>Not a claim of</h5><p>${esc(arr(r.not_a_claim_of).join(' · '))}</p></div>
  </details>`).join('');
}

function unknownMarkup(prepare){
  return arr(prepare?.expandable_blocks?.unknowns).map(u=>`<details class="proof-item">
    <summary><span>${esc(u.id)}</span><strong>${esc(u.title)}</strong></summary>
    <div class="proof-body"><p><b>Why unknown</b> ${esc(u.why_unknown)}</p><p><b>What resolves it</b> ${esc(u.what_would_resolve_it)}</p><p><b>Blocked conclusions</b> ${esc(arr(u.blocked_conclusions).join(' · '))}</p></div>
  </details>`).join('');
}

function questionMarkup(q,index){
  const listens=arr(q.listen_for).map(x=>`<li><strong>${esc(x.pattern)}</strong><span>${esc(x.meaning)}</span><small>${esc(x.next_effect)}</small></li>`).join('');
  const branches=arr(q.conditional_probes).map(p=>`<details class="branch">
    <summary>If earned · ${esc(p.trigger_if)}</summary>
    <div><p><b>Ask</b> ${esc(p.ask)}</p><p><b>Why</b> ${esc(p.why)}</p><p><b>Listen for</b> ${esc(arr(p.listen_for).join(' · '))}</p><p><b>What changes</b> ${esc(p.what_changes)}</p></div>
  </details>`).join('');
  const services=arr(q.linked_service_paths).map(s=>`<li><span>${esc(s.condition)}</span></li>`).join('');
  return `<details class="question-card glass" ${index===0?'open':''}>
    <summary><span class="qnum">${String(index+1).padStart(2,'0')}</span><strong>${esc(q.ask)}</strong><span class="chev">⌄</span></summary>
    <div class="question-body">
      <div class="q-grid">
        <div><span class="micro-label">Why this matters</span><p>${esc(q.why_now)}</p></div>
        <div><span class="micro-label">Already known · don't re-ask</span>${arr(q.already_known_context).map(x=>`<p>${esc(x)}</p>`).join('')}</div>
      </div>
      <div class="listen-block"><span class="micro-label">Listen for</span><ul>${listens}</ul></div>
      ${branches?`<div class="branch-block"><span class="micro-label">Branch only when earned</span>${branches}</div>`:''}
      <details class="answer-effect"><summary>What this answer changes</summary><p>${esc(q.what_the_answer_changes)}</p><p><b>Stop when</b> ${esc(q.stop_condition)}</p>${services?`<ul class="service-conditions">${services}</ul>`:''}</details>
    </div>
  </details>`;
}

function render(brief){
  const prepare=brief?.payload?.prepare||{}, discovery=brief?.payload?.discovery||{}, scorecard=brief?.payload?.scorecard||null, context=brief?.context||{};
  const meeting=readableTime(context.meeting_time);
  const heading=context.prospect_name||brief.company;
  const known=knownGoingIn(discovery);
  const unresolved=arr(prepare.open_dimensions);
  const signals=arr(prepare.signals_that_matter).slice(0,4);
  const flow=arr(discovery.call_flow);
  const strategy=prepare.call_strategy||{};
  const groups=sourceIndex(prepare);
  const ready=arr(discovery?.end_of_call_decision?.ready_for_next_step_if);
  const hold=arr(discovery?.end_of_call_decision?.remain_in_discovery_if);
  const stop=arr(discovery?.end_of_call_decision?.disqualify_or_deprioritize_if);
  const dontAsk=uniq([
    ...arr(strategy.avoid_early),
    ...arr(discovery.do_not_ask).map(x=>x?.detail||x?.topic)
  ]).slice(0,8);
  const nextAction=text(scorecard?.strategy?.recommended_action);

  root.innerHTML=`
    <header class="topbar"><div class="brand">CLARIS</div><div class="top-note">Private pre-call workspace</div><div class="expiry">Expires ${esc(new Date(brief.expires_at).toLocaleDateString())}</div></header>

    <section class="orientation">
      <article class="identity glass">
        <span class="section-kicker">Brief for the scheduled conversation</span>
        <h1>${esc(heading)}</h1>
        <p class="role">${esc(context.prospect_role||'Prospect')} <span>at</span> ${esc(brief.company)}</p>
      </article>
      <article class="meeting glass">
        <span class="section-kicker">The call</span>
        <strong>${meeting?esc(new Date(context.meeting_time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})):'—'}</strong>
        <p>${meeting?esc(new Date(context.meeting_time).toLocaleDateString([], {weekday:'short',day:'numeric',month:'short',year:'numeric'})):'Meeting time not attached'}</p>
        <span class="quiet-badge">Private · certified brief</span>
      </article>
    </section>

    ${context.booking_text?`<section class="booking glass"><div class="section-row"><span class="section-kicker">Booking request</span><span class="quiet-badge">Prospect provided</span></div><blockquote>${esc(context.booking_text)}</blockquote></section>`:''}

    ${scorecardMarkup(scorecard)}

    <section class="focus-grid">
      <article class="focus glass">
        <span class="section-kicker">Call focus</span>
        <h2>${esc(discovery.call_objective||strategy.opening_move||'Run a focused diagnostic conversation.')}</h2>
        ${prepare.executive_readout?`<p class="working-model"><b>Working model</b> ${esc(prepare.executive_readout)}</p>`:''}
      </article>
      <article class="company-intel glass">
        <span class="section-kicker">Relevant company intelligence</span>
        <div class="signal-mini-grid">${signals.map(s=>`<div><strong>${esc(s.signal)}</strong><p>${esc(s.observation)}</p></div>`).join('')}</div>
      </article>
    </section>

    <section class="chapter">
      <div class="chapter-head"><div><span class="section-kicker">Prepare</span><h2>Carry the right mental model into the call</h2></div><p>Known information first. Unresolved variables stay visibly separate because they are the work of the conversation.</p></div>
      <article class="prepare-panel glass">
        <div class="prepare-part">
          <div class="part-head"><h3>Known going in</h3><span>${known.length}</span></div>
          <div class="known-grid">${known.length?known.map((x,i)=>`<div class="known-item"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p></div></div>`).join(''):'<p class="empty-copy">No compact established-context projection is available yet.</p>'}</div>
        </div>
        <div class="divider"></div>
        <div class="prepare-part">
          <div class="part-head"><h3>Still unresolved</h3><span>${unresolved.length}</span></div>
          <div class="unknown-grid">${unresolved.map((d,i)=>`<div class="unknown-item"><span>${String(i+1).padStart(2,'0')}</span><div><strong>${esc(d.label)}</strong><p>${esc(d.why_open)}</p></div></div>`).join('')}</div>
        </div>
      </article>
    </section>

    <section class="chapter run-call">
      <div class="chapter-head"><div><span class="section-kicker">Run the call</span><h2>Conversation path</h2></div><p>${esc(strategy.opening_move||'Use the known context to skip redundant discovery.')}</p></div>
      <ol class="path glass">${flow.map(x=>`<li><span>${esc(x.step)}</span><div><strong>${esc(x.move)}</strong><small>Advance when · ${esc(x.advance_when)}</small></div></li>`).join('')}</ol>
      ${arr(strategy.first_10_minutes).length?`<div class="first-ten"><span class="micro-label">First 10 minutes</span>${arr(strategy.first_10_minutes).map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}
    </section>

    <section class="chapter">
      <div class="chapter-head"><div><span class="section-kicker">Discovery</span><h2>Questions to carry into the conversation</h2></div><p>Ask less. Hear more. Branch only when the answer earns it.</p></div>
      <div class="questions">${arr(discovery.primary_questions).map(questionMarkup).join('')}</div>
    </section>

    <section class="decision glass">
      <div class="decision-top">
        <div><span class="section-kicker">Decision gate</span><h2>${nextAction?'Recommended next move':'Know when to advance'}</h2></div>
        <div class="next-action"><span>${nextAction?'Recommended next move':'When ready'}</span><strong>${esc(nextAction||'Agree the next scoped action with the prospect')}</strong></div>
      </div>
      <div class="decision-grid">
        <div><span class="micro-label">Ready for next step when</span><ul>${ready.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><span class="micro-label">Keep discovering if</span><ul>${hold.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><span class="micro-label">Deprioritize only if</span><ul>${stop.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
      </div>
    </section>

    <section class="dont-waste glass">
      <span class="section-kicker">Don't waste the call on</span>
      <div>${dontAsk.map(x=>`<span>${esc(x)}</span>`).join('')}</div>
    </section>

    <section class="chapter proof">
      <div class="chapter-head"><div><span class="section-kicker">Proof</span><h2>Evidence index</h2></div><p>Provenance stays compact until you need to audit a conclusion.</p></div>
      <div class="proof-tabs" role="tablist">
        <button class="is-active" data-proof-tab="evidence">Evidence · ${arr(prepare?.expandable_blocks?.evidence).length}</button>
        <button data-proof-tab="reasoning">Reasoning · ${arr(prepare?.expandable_blocks?.reasoning).length}</button>
        <button data-proof-tab="unknowns">Unknowns · ${arr(prepare?.expandable_blocks?.unknowns).length}</button>
      </div>
      <div class="proof-panel glass is-active" data-proof-panel="evidence">${proofTray(groups)}</div>
      <div class="proof-panel glass" data-proof-panel="reasoning">${reasoningMarkup(prepare)}</div>
      <div class="proof-panel glass" data-proof-panel="unknowns">${unknownMarkup(prepare)}</div>
    </section>
  `;

  bindProof(groups);
}

function bindProof(groups){
  const groupMap=new Map(groups.map(g=>[g.key,g]));
  const tray=root.querySelector('[data-source-tray]');
  const renderTray=key=>{
    const g=groupMap.get(key); if(!g||!tray)return;
    tray.innerHTML=`<div class="source-tray-head"><div><span class="micro-label">Accepted source</span><h3>${esc(g.key)}</h3></div><small>${g.claims.length} observations · ${g.pages.length} pages · ${esc(g.evidenceIds.join(' · '))}</small></div>
      <p class="source-summary">${esc(g.claims[0]||'Accepted public evidence source.')}</p>
      <div class="source-tray-grid">
        <div><span class="micro-label">Accepted observations</span><ul>${g.claims.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
        <div><span class="micro-label">Used to support</span><p>${esc(g.used.join(' · ')||'Bounded call preparation.')}</p><span class="micro-label">Explicitly not used to infer</span><p>${esc(g.notUsed.join(' · ')||'No unsupported conclusion.')}</p></div>
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
