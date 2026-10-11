import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../api/clarification/admin/package.mjs';

const URL='https://claris-calibration.vercel.app/api/clarification/admin/package';
const operation='FINAL_SNAPSHOT_STORE_GATED';
const adminKey='test-snapshot-store-admin';
const makeKey='test-snapshot-store-make';

function req(token, body, opts={}) {
  const headers=new Headers({
    authorization:'Bearer '+token,
    'x-claris-operation':operation,
    'content-type':'application/json'
  });
  if (opts.length) headers.set('content-length',String(opts.length));
  return new Request(URL,{method:'POST',headers,body:JSON.stringify(body)});
}
test('new snapshot write operation stays disabled and Make never gains write authority',async()=>{
  const backup={
    admin:process.env.CLARIS_ADMIN_KEY,
    make:process.env.CLARIS_MAKE_KEY,
    enabled:process.env.CLARIS_FINAL_SNAPSHOT_WRITE_ENABLED
  };
  try {
    process.env.CLARIS_ADMIN_KEY=adminKey;
    process.env.CLARIS_MAKE_KEY=makeKey;
    delete process.env.CLARIS_FINAL_SNAPSHOT_WRITE_ENABLED;
    const minimal={opportunity_id:'valid_opportunity'};
    let res=await handler.fetch(req(adminKey,minimal));
    assert.equal(res.status,403);
    assert.equal((await res.json()).error,'FINAL_SNAPSHOT_WRITE_DISABLED');
    res=await handler.fetch(req(makeKey,minimal));
    assert.equal(res.status,403);
    process.env.CLARIS_FINAL_SNAPSHOT_WRITE_ENABLED='true';
    res=await handler.fetch(req(makeKey,minimal));
    assert.equal(res.status,401);
    assert.equal((await res.json()).error,'FINAL_SNAPSHOT_ADMIN_ONLY');
    res=await handler.fetch(req(adminKey,{...minimal,external_artifact:{bogus:true}}));
    assert.equal(res.status,400);
    assert.equal((await res.json()).error,'FINAL_SNAPSHOT_INPUT_INVALID');
    res=await handler.fetch(req(adminKey,{opportunity_id:'../bad'}));
    assert.equal(res.status,400);
    assert.equal((await res.json()).error,'OPPORTUNITY_ID_INVALID');
    res=await handler.fetch(req(adminKey,minimal,{length:500000}));
    assert.equal(res.status,413);
    assert.equal((await res.json()).error,'FINAL_SNAPSHOT_INPUT_TOO_LARGE');
    process.env.CLARIS_MAKE_KEY=adminKey;
    res=await handler.fetch(req(adminKey,minimal));
    assert.equal(res.status,401);
    assert.equal((await res.json()).error,'FINAL_SNAPSHOT_ADMIN_ONLY');
  } finally {
    for(const [key,value] of [
      ['CLARIS_ADMIN_KEY',backup.admin],['CLARIS_MAKE_KEY',backup.make],
      ['CLARIS_FINAL_SNAPSHOT_WRITE_ENABLED',backup.enabled]
    ]) {
      if(value===undefined) delete process.env[key];
      else process.env[key]=value;
    }
  }
});
