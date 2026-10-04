import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../../api/calendly/normalize.mjs';

// Pure HTTP contract test. This never contacts Calendly, Make, Gemini or Gmail.
const originalMakeKey = process.env.CLARIS_MAKE_KEY;
const originalAdminKey = process.env.CLARIS_ADMIN_KEY;

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
  t.after(()=>{
    if(originalMakeKey === undefined) delete process.env.CLARIS_MAKE_KEY;
    else process.env.CLARIS_MAKE_KEY=originalMakeKey;
    if(originalAdminKey === undefined) delete process.env.CLARIS_ADMIN_KEY;
    else process.env.CLARIS_ADMIN_KEY=originalAdminKey;
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
