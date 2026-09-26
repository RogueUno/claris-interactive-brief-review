import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePremiumPrepareV36} from './premium-prepare-validator-v36.mjs';

const fixture=new URL('../fixtures/supabase-v1/',import.meta.url);
const booking=fs.readFileSync(new URL('booking.txt',fixture),'utf8').trim();
const sot=JSON.parse(fs.readFileSync(new URL('consultant-sot.json',fixture),'utf8'));
const prepare=JSON.parse(fs.readFileSync(new URL('premium-prepare.json',fixture),'utf8'));
const opts={bookingText:booking,companyDomainHost:'supabase.com',allowedServiceIds:sot.services.map(x=>x.service_id),allowedPolicyKeys:[]};
assert.equal(validatePremiumPrepareV36(prepare,opts).ok,true);

const publicDim=structuredClone(prepare);
publicDim.open_dimensions[0].authority='FIRST_PARTY_PUBLIC';
assert.equal(validatePremiumPrepareV36(publicDim,opts).ok,false);

const inventedQuote=structuredClone(prepare);
inventedQuote.open_dimensions[0].authority_quote='budget approved';
assert.equal(validatePremiumPrepareV36(inventedQuote,opts).ok,false);

const badService=structuredClone(prepare);
badService.conditional_service_paths[0].service_id='SVC_FAKE';
assert.equal(validatePremiumPrepareV36(badService,opts).ok,false);

const badRoute=structuredClone(prepare);
badRoute.priority_questions[0].routes_to=['R99'];
assert.equal(validatePremiumPrepareV36(badRoute,opts).ok,false);

console.log('premium-prepare-validator-v36 tests: PASS');
