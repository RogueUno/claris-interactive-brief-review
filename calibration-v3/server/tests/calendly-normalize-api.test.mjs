import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { trustedBookingFactsEnabled, trustedBookingFactHttpStatus } from '../../../api/calendly/normalize.mjs';

// Pure HTTP contract test. This never contacts Calendly, Make, Gemini or Gmail.
const originalMakeKey = process.env.CLARIS_MAKE_KEY;
const originalAdminKey = process.env.CLARIS_ADMIN_KEY;
const originalTrustedFactsFlag = process.env.CLARIS_TRUSTED_BOOKING_FACTS_V1;

function request(answers, websiteRequired=true) {
  return new Request('https://claris.test/api/calendly/normalize', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      authorization:'Bearer synthetic-ci-only-key'
    },
    body:JSON.stringify({
      consultant_id:'consultant_alpha',
      require_company_website_answer:websiteRequired,
      event:{
        uri:'https://api.calendly.com/scheduled_events/event-001',
        start_time:'2026-10-09T15:00:00Z'
      },
      invitee:{
        uri:'https://api.calendly.com/scheduled_events/event-001/invitees/invitee-001',
        name:'Robin Security',
        email:'robin@acme-security.com',
        questions_and_answers:answers
      }
    })
  });
}
test('authenticated Calendly API enforces Make supplied website-required boolean', async t=>{
  process.env.CLARIS_MAKE_KEY='synthetic-ci-only-key';
  delete process.env.CLARIS_ADMIN_KEY;
  delete process.env.CLARIS_TRUSTED_BOOKING_FACTS_V1;
  t.after(()=>{
    if(originalMakeKey === undefined) delete process.env.CLARIS_MAKE_KEY;
    else process.env.CLARIS_MAKE_KEY=originalMakeKey;
    if(originalAdminKey === undefined) delete process.env.CLARIS_ADMIN_KEY;
    else process.env.CLARIS_ADMIN_KEY=originalAdminKey;
    if(originalTrustedFactsFlag === undefined) delete process.env.CLARIS_TRUSTED_BOOKING_FACTS_V1;
    else process.env.CLARIS_TRUSTED_BOOKING_FACTS_V1=originalTrustedFactsFlag;
  });

  const noWebsite = await handler.fetch(request([
    {question:'Please share anything that will help prepare for our meeting.',
     answer:'We are evaluating ISO 27001 consultants.'}
  ]));
  assert.equal(noWebsite.status,422);
  const blocked=await noWebsite.json();
  assert.equal(blocked.ok,false);
  assert.ok(blocked.missing.includes('company_website_answer'));
  assert.equal(blocked.provenance.domain,null);
  assert.equal(blocked.booking.domain,null);

  const withWebsite = await handler.fetch(request([
    {question:'Company website',answer:'https://www.acme-security.com'},
    {question:'Please share anything that will help prepare for our meeting.',
     answer:'We are evaluating ISO 27001 consultants.'}
  ]));
  assert.equal(withWebsite.status,200);
  const accepted=await withWebsite.json();
  assert.equal(accepted.ok,true);
  assert.equal(accepted.booking.domain,'https://acme-security.com');
  assert.equal(accepted.booking.company,'Acme Security');
  assert.equal(accepted.provenance.domain,'QUESTION_DOMAIN');
  assert.equal(accepted.provenance.company,'DOMAIN_LABEL');
});

test('trusted booking facts feature flag is default-off and explicit-only', ()=>{
  assert.equal(trustedBookingFactsEnabled({}), false);
  assert.equal(trustedBookingFactsEnabled({CLARIS_TRUSTED_BOOKING_FACTS_V1:'false'}), false);
  for(const value of ['1','true','TRUE','enabled',' enabled ']) {
    assert.equal(trustedBookingFactsEnabled({CLARIS_TRUSTED_BOOKING_FACTS_V1:value}), true, value);
  }
});

test('trusted booking fact API status mapping fails closed', ()=>{
  assert.equal(trustedBookingFactHttpStatus({ok:true}), 200);
  assert.equal(trustedBookingFactHttpStatus({ok:false,error:'BOOKING_FACT_IMMUTABLE_CONFLICT'}), 409);
  assert.equal(trustedBookingFactHttpStatus({ok:false,error:'PROFILE_NOT_LOCKED'}), 409);
  assert.equal(trustedBookingFactHttpStatus({ok:false,error:'RUNTIME_V3_NOT_READY'}), 409);
  for(const error of [
    'PROFILE_READ_FAILED','BOOKING_FACT_CREATE_UNCERTAIN',
    'TRUSTED_BOOKING_FACT_PERSIST_FAILED','TRUSTED_BOOKING_FACT_COMPILE_FAILED',
    'TRUSTED_BOOKING_FACT_SERVER_UNAVAILABLE'
  ]) assert.equal(trustedBookingFactHttpStatus({ok:false,error}), 503, error);
  assert.equal(trustedBookingFactHttpStatus({ok:false,error:'COMPANY_WEBSITE_INVALID'}), 422);
});
