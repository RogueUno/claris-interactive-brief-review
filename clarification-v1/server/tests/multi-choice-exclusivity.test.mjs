import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeProspectAnswers} from '../../../clarification-v1/server/contract.mjs';
const pkg={status:'OPEN',questions:[{question_id:'q_scope',mode:'DISCOVER',response_type:'MULTI_CHOICE',required:true,allow_other:true,allow_unsure:true,unsure_label:'Not sure yet',options:[{option_id:'api',label:'API'},{option_id:'soc2',label:'SOC 2'}]}]};
test('multi choice cannot combine unsure with concrete scopes',()=>{
 const answer=[{question_id:'q_scope',value:[{kind:'UNSURE'},{kind:'OPTION',option_id:'soc2'}]}];
 assert.throws(()=>normalizeProspectAnswers(pkg,answer),/ANSWER_UNSURE_EXCLUSIVE/);
});
