const root=document.getElementById('brief-root');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arr=v=>Array.isArray(v)?v:[];
const safeUrl=value=>{try{const u=new URL(String(value||''));return u.protocol==='https:'?u.href:'#';}catch{return '#';}};

function tokenFromFragment(){const raw=location.hash.startsWith('#')?location.hash.slice(1):'';const p=new URLSearchParams(raw);return String(p.get('brief')||'').trim()||null;}
function clearFragment(){history.replaceState(null,document.title,location.pathname+location.search);}
async function requestJson(url,options={}){const {headers={},...rest}=options;const r=await fetch(url,{...rest,credentials:'same-origin',headers:{'Content-Type':'application/json',...headers}});let body=null;try{body=await r.json();}catch{}return{ok:r.ok,status:r.status,body};}
function gate(title,detail){root.innerHTML=`<section class="gate"><div class="eyebrow">CLARIS · Private Opportunity Intelligence</div><h1>${esc(title)}</h1><p>${esc(detail)}</p></section>`;}

function chips(xs){return arr(xs).map(x=>`<button type="button" class="chip" data-ref="${esc(x)}">${esc(x)}</button>`).join('');}
function render(brief){
  const prepare=brief?.payload?.prepare||{}, discovery=brief?.payload?.discovery||{};
  const signals=arr(prepare.signals_that_matter).map((s,i)=>`<article class="signal"><div class="num">${i+1}</div><div><h3>${esc(s.signal)}</h3><p>${esc(s.observation)}</p><p><strong>Call implication</strong> ${esc(s.call_implication)}</p>${chips(s.routes_to)}</div></article>`).join('');
  const questions=arr(discovery.primary_questions).map(q=>{
    const listens=arr(q.listen_for).map(x=>`<li><strong>“${esc(x.pattern)}”</strong><span>${esc(x.meaning)}</span><em>${esc(x.next_effect)}</em></li>`).join('');
    const probes=arr(q.conditional_probes).map(p=>`<details class="probe"><summary>If you hear: ${esc(p.trigger_if)}</summary><div class="detailbody"><p><strong>Ask</strong> ${esc(p.ask)}</p><p><strong>Why</strong> ${esc(p.why)}</p><p><strong>Listen for</strong> ${esc(arr(p.listen_for).join(' · '))}</p><p><strong>Changes</strong> ${esc(p.what_changes)}</p></div></details>`).join('');
    const services=arr(q.linked_service_paths).map(s=>`<li><code>${esc(s.service_id)}</code><span>${esc(s.condition)}</span></li>`).join('');
    return `<article class="question"><div class="qhead"><span class="qid">${esc(q.question_id)}</span><div><small>${esc(q.ontology_intent)} · ${esc(q.authority)}</small><h3>${esc(q.ask)}</h3></div></div><p><strong>Why now</strong> ${esc(q.why_now)}</p><div class="known"><strong>Already known — don’t re-ask</strong>${arr(q.already_known_context).map(x=>`<p>${esc(x)}</p>`).join('')}</div><h4>Listen for</h4><ul class="listen">${listens}</ul>${probes}<div class="stop"><strong>Stop when</strong> ${esc(q.stop_condition)}</div>${services?`<h4>Conditional service paths</h4><ul class="services">${services}</ul>`:''}</article>`;
  }).join('');
  const flow=arr(discovery.call_flow).map(x=>`<li><span>${esc(x.step)}</span><div><strong>${esc(x.move)}</strong><small>Advance when: ${esc(x.advance_when)}</small></div></li>`).join('');
  const dna=arr(discovery.do_not_ask).map(x=>`<li><strong>${esc(x.topic)}</strong><span>${esc(x.detail)}</span></li>`).join('');
  const ev=arr(prepare?.expandable_blocks?.evidence).map(e=>`<details id="${esc(e.id)}"><summary><b>${esc(e.id)}</b> ${esc(e.title)}</summary><div class="detailbody"><h5>Claims</h5>${arr(e.claims).map(x=>`<p>${esc(x)}</p>`).join('')}<h5>Sources</h5>${arr(e.sources).map(s=>`<p><a target="_blank" rel="noreferrer" href="${safeUrl(s.url)}">${esc(s.url)}</a><br><small>${esc(s.supports)}</small></p>`).join('')}<h5>Used for</h5><p>${esc(arr(e.used_for).join(' · '))}</p><h5>Not used for</h5><p>${esc(arr(e.not_used_for).join(' · '))}</p></div></details>`).join('');
  const rs=arr(prepare?.expandable_blocks?.reasoning).map(r=>`<details id="${esc(r.id)}"><summary><b>${esc(r.id)}</b> ${esc(r.title)}</summary><div class="detailbody"><h5>Premises</h5>${arr(r.premises).map(x=>`<p>${esc(x)}</p>`).join('')}<h5>Bounded observation</h5><p>${esc(r.observation)}</p><h5>Not a claim of</h5><p>${esc(arr(r.not_a_claim_of).join(' · '))}</p></div></details>`).join('');
  const us=arr(prepare?.expandable_blocks?.unknowns).map(u=>`<details id="${esc(u.id)}"><summary><b>${esc(u.id)}</b> ${esc(u.title)}</summary><div class="detailbody"><p><strong>Why unknown</strong> ${esc(u.why_unknown)}</p><p><strong>What resolves it</strong> ${esc(u.what_would_resolve_it)}</p><p><strong>Blocked conclusions</strong> ${esc(arr(u.blocked_conclusions).join(' · '))}</p></div></details>`).join('');
  root.innerHTML=`<div class="eyebrow">CLARIS · Opportunity Intelligence</div><h1>${esc(brief.company)}</h1><div class="meta">Private brief · expires ${esc(new Date(brief.expires_at).toLocaleString())}</div><section class="hero"><div class="eyebrow">Executive readout</div><p>${esc(prepare.executive_readout)}</p></section><h2>Signals that matter</h2>${signals}<h2>Live diagnostic map</h2><div class="eyebrow">Ask less · hear more · branch only when the answer earns it</div>${questions}<h2>Call flow</h2><ol class="flow">${flow}</ol><h2>Do not ask</h2><ul class="dna">${dna}</ul><h2>Evidence & reasoning</h2>${ev}${rs}${us}`;
  root.addEventListener('click',e=>{const b=e.target.closest('[data-ref]');if(!b)return;const d=document.getElementById(b.dataset.ref);if(d){d.open=true;d.scrollIntoView({behavior:'smooth',block:'center'});}});
}

async function boot(){
  const gateway='/api/delivery/package';
  const token=tokenFromFragment();
  if(token){clearFragment();const resolved=await requestJson(gateway,{method:'POST',body:JSON.stringify({operation:'brief_resolve',brief_token:token})});if(!resolved.ok){gate('This private brief could not be opened.',resolved.status===410?'The link expired or was revoked.':'Request a fresh CLARIS brief link.');return;}}
  const loaded=await requestJson(gateway,{method:'POST',body:JSON.stringify({operation:'brief_data'})});
  if(!loaded.ok){gate('A private brief link is required.',loaded.status===410?'This brief expired or was revoked.':'Open the CLARIS link you received to view this brief.');return;}
  render(loaded.body.brief);
}
boot().catch(()=>gate('This private brief could not be opened.','A network or server error occurred. Request a fresh CLARIS brief link.'));
