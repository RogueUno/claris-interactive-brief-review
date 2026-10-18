import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync,mkdirSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
import {chromium} from 'playwright';
import {projectFinalReplay} from './replay-adapter.mjs';
import {reviewEvidenceScore} from './evidence-score-review.mjs';
import {reviewDecisionQuality} from '../clarification-v1/server/decision-quality-review.mjs';

// Uses fictional test content only. No user sessions, emails, API keys or paid providers.
const booking='A fictional enterprise buyer paused a proposed annual contract pending SOC 2 assurance evidence. They ask for questionnaire responses, EU data-processing coverage and proof of API scope. The buyer call is in three weeks, but acceptable evidence is not yet confirmed. A scoped evidence review may be preferable to formal SOC 2 readiness.';
const raw={
  preliminary_brief_markdown:'### Strategic Overview\nA fictional enterprise buyer has blocked procurement pending scoped assurance materials.\n\n### Critical Timing & Stakeholders\nAn assurance review call is planned, and security leadership has technical approval responsibility.\n\n### Primary Objectives\nEstablish evidence acceptance criteria and identify the real assurance scope before advising a readiness project.',
  match_score_explanation:{
    service_need_alignment:{status:'MATCH',basis_ids:['BOOK-001','PROS-001-A'],reasoning:'Scoped SOC 2 assurance evidence is required for procurement.'},
    buyer_stakeholder_fit:{status:'PARTIAL_MATCH',basis_ids:['BOOK-001'],reasoning:'A technical review team is named but the decision owner remains unknown.'},
    engagement_economics:{status:'UNKNOWN',basis_ids:[],reasoning:'No consulting budget has been approved.'},
    expansion_potential:{status:'UNKNOWN',basis_ids:[],reasoning:'No admissible expansion evidence.'}
  },
  question_plan:[
    {question_id:'Q_BUDGET',text:'Who can approve a scoped evidence-review engagement?',rationale:'Confirm the commercial decision owner.'},
    {question_id:'Q_SCOPE',text:'Does your existing SOC 2 report cover EU hosting and the API integration?',rationale:'Clarify buyer-required evidence scope.'},
    {question_id:'Q_SIGNOFF',text:'Who decides if the assurance package is acceptable?',rationale:'Distinguish technical sign-off from procurement acceptance.'}
  ],
  engagement_metadata:{deterministic_metrics:{supported_match:80,scorable_coverage:85,evidence_completeness:100}},
  completeness_score_explanation:{
    critical_question_coverage:{status:'COMPLETE',score:35,basis_ids:['BOOK-001','PROS-001-A'],reasoning:'Provider judged requested scope sufficiently captured.'},
    source_authority:{status:'COMPLETE',score:25,basis_ids:['BOOK-001','PROS-001-A'],reasoning:'Booking and accepted answer supplied buyer claims.'},
    corroboration_depth:{status:'COMPLETE',score:15,basis_ids:['FAC-001'],reasoning:'Official docs describe available hosting and API features.'},
    freshness:{status:'COMPLETE',score:15,basis_ids:['BOOK-001'],reasoning:'Provider used the current simulated booking.'},
    conflict_ambiguity_control:{status:'COMPLETE',score:10,basis_ids:[],reasoning:'Provider found no conflict.'}
  },
  intelligence_lineage:[{insight:'Assurance evidence blocks a sale',evidence_ids:['BOOK-001','PROS-001-A']},
    {insight:'Official API documentation exists',evidence_ids:['FAC-001']}],
  potential_service_relevance:[{service_id:'SVC_SOC2'}]
};
const registry=[
  {evidence_id:'FAC-001',admission_status:'ADMITTED',sensitivity:'STANDARD',source_url:'https://posthog.com/docs/api',
    authority:'VERIFIED_PUBLIC_FACT',source_title:'API documentation',source_excerpt:'Official API documentation describes available integrations.'},
  {evidence_id:'FAC-002',admission_status:'ADMITTED',sensitivity:'STANDARD',source_url:'https://example.org/company',
    authority:'THIRD_PARTY_REPORTED',source_title:'Illustrative directory',
    source_excerpt:'The company was founded in 2020 and based in San Francisco.'}
];
const accepted={ok:true,entries:[{evidence_id:'PROS-001',value:'Accepted simulation'}]};
const review=reviewDecisionQuality(raw,{trustedBookingText:booking});
const artifact=projectFinalReplay({
  company:'Fictional post-analytics buyer',context:{booking_text:booking,
    prospect_name:'Avery (fictional)',prospect_role:'Assurance coordinator',
    simulation_note:'Illustrative controlled test; not a Calendly event',meeting_time:null},
  payload:{final_replay_v3:raw}
},{evidenceRegistry:registry});
artifact.payload.commercial_depth={
  ...review,status:'HOLD_FOR_COMMERCIAL_REVIEW',
  buyer_deliverable_fork:review.buyer_deliverable_fork.open?review.buyer_deliverable_fork:{
    required:true,open:true,reviewer_question:{
      question:'What exact assurance deliverable will unblock procurement?',
      rationale:'The buyer acceptance criteria are not established.',
      basis_ids:['BOOK-001']
    }
  }
};
artifact.payload.evidence_score_review=reviewEvidenceScore(raw,{
  evidenceRegistry:registry,acceptedManifest:accepted,commercialReview:artifact.payload.commercial_depth
});
assert.equal(artifact.payload.scorecard.lead_fit.provisional_grade,'A');
assert.equal(artifact.payload.evidence_score_review.review_required,true);
assert.equal(artifact.payload.discovery.primary_questions.length,3);

const root=resolve(process.cwd());
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url||'/', 'http://localhost').pathname;
  if(path==='/api/delivery/package'&&req.method==='POST'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({ok:true,brief:artifact}));return;
  }
  const local=resolve(root,'.'+(path.endsWith('/')?path+'index.html':path));
  if(!local.startsWith(root+'/')&&!local.startsWith(root+'\\')){res.writeHead(403);res.end();return;}
  try{
    const data=await readFile(local);
    res.writeHead(200,{'Content-Type':mime[extname(local)]||'application/octet-stream'});
    res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const results=[];
const folder=join(root,'browser-qa-artifacts');
mkdirSync(folder,{recursive:true});
try{
  for(const [name,width,height] of [
    ['desktop',1440,900],['tablet',820,1180],['mobile',390,844],['small-mobile',360,780]
  ]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1, reducedMotion:'reduce'});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+port+'/brief-v5/',{waitUntil:'networkidle'});
    await page.locator('.signal-block').waitFor({state:'visible',timeout:12000});
    assert.equal(await page.locator('details.question-phase').count(),3,name+' questions');
    assert.equal(await page.locator('.blindspots').count(),1,name+' critical blindspots');
    assert.ok((await page.locator('.blindspots').innerText()).includes('Buyer-required assurance deliverable'),name+' buyer fork');
    assert.ok((await page.locator('body').innerText()).includes('Commercial review required'),name+' review hold');
    const fit=page.locator('[data-score="fit"]');
    const evidence=page.locator('[data-score="evidence"]');
    assert.match(await fit.innerText(),/A[\s\S]*80\/100/,name+' grade');
    assert.match(await evidence.innerText(),/A[\s\S]*100\/100/,name+' evidence grade');
    await evidence.click();
    const tray=page.locator('[data-score-tray]');
    assert.equal(await tray.isVisible(),true);
    assert.match(await tray.innerText(),/Why this provider grade is under review/);
    assert.match(await tray.innerText(),/buyer-required assurance deliverable/i);
    const toggle=page.locator('[data-booking-toggle]');
    if(await toggle.count()){await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');}
    const first=page.locator('details.question-phase').first();
    if(!(await first.evaluate(el=>el.open)))await first.locator('summary').click();
    const overflow=await page.evaluate(()=>({
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:document.documentElement.clientWidth,
      problemElements:[...document.querySelectorAll('main *')].filter(el=>{
        const r=el.getBoundingClientRect();
        return r.width>0&&(r.right>document.documentElement.clientWidth+4||r.left< -4);
      }).slice(0,8).map(el=>({tag:el.tagName,cls:String(el.className).slice(0,100)}))
    }));
    assert.ok(overflow.documentWidth<=overflow.viewportWidth+3,
      name+' horizontal overflow '+JSON.stringify(overflow));
    assert.deepEqual(errors,[],name+' browser runtime errors');
    // The badge must not sit over the grade arc. This was visible in real screenshots.
    const labelOverlaps=await page.locator('.instrument-deck .gauge').evaluateAll(items=>
      items.flatMap((g,i)=>{
        const svg=g.querySelector('svg'),badge=g.querySelector('.gauge-badge');
        if(!svg||!badge)return[];
        const a=svg.getBoundingClientRect(),b=badge.getBoundingClientRect();
        return b.top < a.bottom-2 ?[{gauge:i,badgeTop:b.top,svgBottom:a.bottom}]:[];
      }));
    assert.deepEqual(labelOverlaps,[],name+' gauge badge overlays arc');
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    const file=join(folder,name+'.png');
    await page.screenshot({path:file,fullPage:true,animations:'disabled'});
    results.push({name,width,height,questions:3,reviewHold:true,overflowPx:overflow.documentWidth-overflow.viewportWidth,
      screenshot:file.replace(root+'/','')});
    await context.close();
  }
  await readFile(join(folder,'desktop.png'));
  process.stdout.write('V5_BROWSER_QA_PASS '+JSON.stringify(results)+'\n');
}finally{
  await browser.close();
  await new Promise(ok=>server.close(ok));
}
