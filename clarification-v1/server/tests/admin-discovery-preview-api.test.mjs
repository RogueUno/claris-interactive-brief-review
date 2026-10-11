import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../api/clarification/admin/package.mjs';

const PATH='https://claris-calibration.vercel.app/api/clarification/admin/package';
const op='DISCOVERY_PREVIEW_READ_ONLY';

function request(method,token,body,operation=op) {
  return new Request(PATH,{
    method,
    headers:{
      'authorization':'Bearer '+token,
      'x-claris-operation':operation,
      'content-type':'application/json'
    },
    ...(method==='POST' ? {body:JSON.stringify(body)} : {})
  });
}

test('preview is admin-only and rejects Make credentials even though existing operations accept Make',async()=>{
  const oldAdmin=process.env.CLARIS_ADMIN_KEY;
  const oldMake=process.env.CLARIS_MAKE_KEY;
  try {
    process.env.CLARIS_ADMIN_KEY='read-only-preview-test-admin';
    process.env.CLARIS_MAKE_KEY='read-only-preview-test-make';
    let res=await handler.fetch(request('POST','read-only-preview-test-make',{opportunity_id:'demo_case'}));
    assert.equal(res.status,401);
    assert.equal((await res.json()).error,'DISCOVERY_PREVIEW_ADMIN_ONLY');
    res=await handler.fetch(request('POST','invalid',{opportunity_id:'demo_case'}));
    assert.equal(res.status,401);
    res=await handler.fetch(request('GET','read-only-preview-test-admin',{opportunity_id:'demo_case'}));
    assert.equal(res.status,405);
    res=await handler.fetch(request('POST','read-only-preview-test-admin',{opportunity_id:'../../secret'}));
    assert.equal(res.status,400);
    assert.equal((await res.json()).error,'OPPORTUNITY_ID_INVALID');
    res=await handler.fetch(request('POST','read-only-preview-test-admin',{
      opportunity_id:'demo_case', final_stage_output_json:{fake:true}
    }));
    assert.equal(res.status,400);
    assert.equal((await res.json()).error,'PREVIEW_ONLY_OPPORTUNITY_ID_ALLOWED');
    assert.equal(res.headers.get('cache-control'),'no-store');
    // Shared secrets cannot accidentally give Make operators admin privileges.
    process.env.CLARIS_MAKE_KEY=process.env.CLARIS_ADMIN_KEY;
    res=await handler.fetch(request('POST','read-only-preview-test-admin',{opportunity_id:'demo_case'}));
    assert.equal(res.status,401);
  } finally {
    if (oldAdmin===undefined) delete process.env.CLARIS_ADMIN_KEY;
    else process.env.CLARIS_ADMIN_KEY=oldAdmin;
    if (oldMake===undefined) delete process.env.CLARIS_MAKE_KEY;
    else process.env.CLARIS_MAKE_KEY=oldMake;
  }
});
