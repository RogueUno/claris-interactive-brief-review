import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMakeDeliveryInput, DIRECT_FINAL_FORM_FIELDS,
  SUBMITTED_FINAL_FORM_FIELDS } from '../make-delivery-transport.mjs';
import { createDeliveryGateway } from '../../../api/delivery/package.mjs';

const AUTH = 'Bearer synthetic-test-auth';
const url = 'https://claris.example/api/delivery/package';
function request(operation, body, { form = true, auth = true } = {}) {
  const headers = {
    'x-claris-delivery': operation,
    ...(auth ? { authorization: AUTH } : {})
  };
  if (form) headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
  else headers['content-type'] = 'application/json';
  return new Request(url, {
    method: 'POST', headers,
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body)
  });
}
const fallback = async r => ({ ok: true, value: await r.json() });

test('structured form safely preserves quoted, multiline and Unicode brief text', async () => {
  const textValue = 'CISO: "Review & assess = yes"\nÉquipe SOC 2\n<no-html>';
  const form = request('direct_final_claim', {
    opportunity_id: 'calendly_012345',
    consultant_sot_json: '{"consultant":{"firm":"L’Atelier \\"R&D\\""}}',
    company: 'Acme "R&D" & Compliance',
    final_brief_markdown: textValue,
    requires_clarification: 'false',
    final_audit_json: '{"audit_status":"PASS","violations":[],"repair_required":false}'
  });
  const parsed = await parseMakeDeliveryInput(
    form, fallback, DIRECT_FINAL_FORM_FIELDS.direct_final_claim
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.final_brief_markdown, textValue);
  assert.equal(parsed.value.company, 'Acme "R&D" & Compliance');
  assert.equal(parsed.value.requires_clarification, false);
  assert.match(parsed.value.consultant_sot_json, /R&D/);
});

test('duplicate, unexpected and malformed boolean form fields fail closed', async () => {
  for(const [encoded,error] of [
    ['opportunity_id=abc&opportunity_id=attacker','DELIVERY_FORM_FIELD_INVALID'],
    ['opportunity_id=abc&__proto__=unsafe','DELIVERY_FORM_FIELD_INVALID'],
    ['requires_clarification=false-ish','DELIVERY_FORM_BOOLEAN_INVALID'],
    ['opportunity_id=abc%00','DELIVERY_FORM_FIELD_INVALID']
  ]) {
    const req = new Request(url, {
      method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'},
      body:encoded
    });
    const parsed = await parseMakeDeliveryInput(
      req, fallback, DIRECT_FINAL_FORM_FIELDS.direct_final_claim
    );
    assert.equal(parsed.ok, false, encoded);
    assert.equal((await parsed.response.json()).error, error);
  }
});

test('form parsing is unavailable for unrelated API operations and oversized bodies', async () => {
  let req = request('CONSULTANT_FINAL', { consultant_delivery_email:'attacker@example.org' });
  let parsed = await parseMakeDeliveryInput(req, fallback, undefined);
  assert.equal(parsed.response.status, 415);
  const tooBig = request('direct_final_claim', {
    final_brief_markdown:'A'.repeat(451000)
  });
  parsed = await parseMakeDeliveryInput(
    tooBig, fallback, DIRECT_FINAL_FORM_FIELDS.direct_final_claim
  );
  assert.equal(parsed.response.status,413);
  assert.deepEqual(SUBMITTED_FINAL_FORM_FIELDS.FINAL_DELIVERY_PREFLIGHT, ['opportunity_id']);
});

test('new transport still accepts original JSON without alteration', async () => {
  const parsed = await parseMakeDeliveryInput(
    request('direct_final_claim', { status:'FINALIZED', requires_clarification:false },
      {form:false}), fallback, DIRECT_FINAL_FORM_FIELDS.direct_final_claim
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.requires_clarification, false);
});

test('authenticated direct-final endpoint receives escaped form fields and rejects unknown results', async () => {
  const calls=[];
  const gateway=createDeliveryGateway({
    authorize:r=>r.headers.get('authorization')===AUTH,
    directFinalOutboxProvider:async()=>({
      async begin(data){calls.push(['begin',data]);return {ok:true,status:'REGISTERED'};},
      async recoverRegistered(data){calls.push(['recover',data]);return {ok:true,status:'RECOVERY_AUTHORIZED'};},
      async claim(data){calls.push(['claim',data]);return {ok:false,status:'RECONCILIATION_REQUIRED'};},
      async acknowledge(data){calls.push(['ack',data]);return {ok:true,status:'ACKNOWLEDGED'};}
    })
  });
  const form={opportunity_id:'calendly_012345', company:'Acme\n"Test"',
    requires_clarification:'false'};
  const unauthorized=await gateway.fetch(request('direct_final_claim',form,{auth:false}));
  assert.equal(unauthorized.status,401);
  assert.equal(calls.length,0);
  const response=await gateway.fetch(request('direct_final_claim',form));
  assert.equal(response.status,409);
  assert.equal(calls.length,1);
  assert.equal(calls[0][1].company,form.company);
  assert.equal(calls[0][1].requires_clarification,false);

  const recovery=await gateway.fetch(request('direct_final_recover',{
    opportunity_id:'calendly_012345',consultant_id:'consultant_alpha',
    consultant_delivery_email:'consultant@example.com',
    consultant_sot_json:'{"consultant":{"firm":"Test"}}',
    company:'Acme',prospect_first_name:'Robin',prospect_email:'robin@acme.com',
    meeting_time:'2026-10-09T15:00:00Z',domain:'https://acme.com/',
    recovery_reason:'PROVIDER_TRANSIENT_503'
  }));
  assert.equal(recovery.status,200);
  assert.equal(calls[1][0],'recover');
  assert.equal(calls[1][1].recovery_reason,'PROVIDER_TRANSIENT_503');

  const ack=await gateway.fetch(request('direct_final_ack',{
    opportunity_id:'calendly_012345',claim_token:'a'.repeat(64),provider_message_id:'msg=1&2'
  }));
  assert.equal(ack.status,200);
  assert.equal(calls[2][1].provider_message_id,'msg=1&2');
});


test('direct-final recovery form exposes only the exact registered-recovery fields', async()=>{
  const fields=DIRECT_FINAL_FORM_FIELDS.direct_final_recover;
  assert.deepEqual(fields,[
    'opportunity_id','consultant_id','consultant_delivery_email',
    'consultant_sot_json','company','prospect_first_name',
    'prospect_email','meeting_time','domain','recovery_reason'
  ]);
  const parsed=await parseMakeDeliveryInput(
    request('direct_final_recover',{
      opportunity_id:'calendly_012345',consultant_id:'consultant_alpha',
      consultant_delivery_email:'consultant@example.com',consultant_sot_json:'{}',
      company:'Acme',prospect_first_name:'Robin',prospect_email:'robin@acme.com',
      meeting_time:'2026-10-09T15:00:00Z',domain:'https://acme.com/',
      recovery_reason:'PROVIDER_TRANSIENT_503'
    }),
    fallback,fields
  );
  assert.equal(parsed.ok,true);
  assert.equal(parsed.value.recovery_reason,'PROVIDER_TRANSIENT_503');
});
