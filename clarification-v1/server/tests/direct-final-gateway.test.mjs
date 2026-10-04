import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeliveryGateway } from '../../../api/delivery/package.mjs';

function request(operation, value={}, authenticated=true) {
  return new Request('https://claris.example/api/delivery/package', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-claris-delivery':operation,
      ...(authenticated ? {authorization:'Bearer safe-pilot-key'} : {})
    },
    body:JSON.stringify(value)
  });
}

test('direct-final Make route is authenticated and returns status-gated 409',async()=>{
  const calls=[];
  const gateway=createDeliveryGateway({
    authorize:req=>req.headers.get('authorization')==='Bearer safe-pilot-key',
    directFinalOutboxProvider: async()=>({
      async begin(input){calls.push(['begin',input]);return {ok:true,status:'REGISTERED',registration_token:'f'.repeat(64)};},
      async claim(input){calls.push(['claim',input]);return {ok:false,status:'RECONCILIATION_REQUIRED',error:'DIRECT_FINAL_SEND_OUTCOME_UNKNOWN'};},
      async acknowledge(input){calls.push(['ack',input]);return {ok:true,status:'ACKNOWLEDGED',reused:false};}
    })
  });
  const noKey=await gateway.fetch(request('direct_final_begin',{opportunity_id:'opp_abc'},false));
  assert.equal(noKey.status,401);
  assert.equal(calls.length,0);
  const begin=await gateway.fetch(request('direct_final_begin',{opportunity_id:'opp_abc'}));
  assert.equal(begin.status,200);
  assert.equal((await begin.json()).status,'REGISTERED');
  const claim=await gateway.fetch(request('direct_final_claim',{opportunity_id:'opp_abc'}));
  assert.equal(claim.status,409);
  assert.equal((await claim.json()).ok,false);
  const ack=await gateway.fetch(request('direct_final_ack',{opportunity_id:'opp_abc'}));
  assert.equal(ack.status,200);
  assert.equal((await ack.json()).status,'ACKNOWLEDGED');
  assert.deepEqual(calls.map(x=>x[0]),['begin','claim','ack']);
});

test('existing package operations still work unchanged',async()=>{
  const gateway=createDeliveryGateway({
    authorize:req=>req.headers.get('authorization')==='Bearer safe-pilot-key',
    directFinalOutboxProvider:async()=>{throw Error('must not instantiate outbox');}
  });
  const packaged=await gateway.fetch(request('CONSULTANT_FINAL',{
    consultant_delivery_email:'consultant@example.org',
    consultant_first_name:'Casey',
    company:'Example Company',
    final_brief_markdown:'# Review\nReady to discuss scope.'
  }));
  assert.equal(packaged.status,200);
  const body=await packaged.json();
  assert.equal(body.delivery.kind,'CONSULTANT_FINAL');
  assert.equal(body.delivery.to,'consultant@example.org');
});
