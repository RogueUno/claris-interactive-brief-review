import { createHash } from 'node:crypto';

// This is a deterministic evidence ID mapping over the exact accepted
// clarification answers stored with a submitted opportunity. PROS-001 refers
// to the first *accepted* answer, not the first displayed form question.
// It verifies source identity and integrity, not the semantic correctness of
// claims generated about the answer.
const digest=x=>createHash('sha256').update(JSON.stringify(x),'utf8').digest('hex');
const validId=/^[A-Za-z0-9_-]{3,100}$/;

export function deriveAcceptedProspectManifest(envelope) {
  const deny=error=>({ok:false,error});
  const pkg=envelope?.package;
  const response=envelope?.response;
  if (pkg?.status!=='SUBMITTED' || !response ||
      response.schema_version!=='claris_prospect_response_v1' ||
      response.source_class!=='PROSPECT_REPORTED' ||
      response.opportunity_id!==envelope.opportunity_id ||
      typeof response.submitted_at!=='string' ||
      !Number.isFinite(Date.parse(response.submitted_at)) ||
      !Array.isArray(pkg.questions) || !Array.isArray(response.answers)) {
    return deny('ACCEPTED_PROSPECT_RESPONSE_REQUIRED');
  }
  const questions=new Map();
  for(const question of pkg.questions) {
    if(!validId.test(question?.question_id) || questions.has(question.question_id)) {
      return deny('PROSPECT_QUESTION_SET_INVALID');
    }
    questions.set(question.question_id,question);
  }
  const entries=[];
  const seen=new Set();
  let previous=-1;
  const ids=Array.from(questions.keys());
  for(const answer of response.answers) {
    const questionId=answer?.question_id;
    const index=ids.indexOf(questionId);
    if(index<0 || index<=previous || seen.has(questionId) ||
      answer?.source_class!=='PROSPECT_REPORTED' ||
      (answer.mode && answer.mode!==questions.get(questionId)?.mode) ||
      !['OPTION','OTHER','UNSURE','MULTI','TEXT'].includes(answer.answer_kind) ||
      (typeof answer.value!=='string' && !Array.isArray(answer.value)) ||
      (typeof answer.value==='string' && !answer.value.trim()) ||
      (Array.isArray(answer.value) && !answer.value.length)) {
      return deny('ACCEPTED_PROSPECT_ANSWER_INVALID');
    }
    previous=index;
    seen.add(questionId);
    const evidenceId='PROS-'+String(entries.length+1).padStart(3,'0');
    if(answer.source_evidence_id!=null &&
        answer.source_evidence_id!==evidenceId) {
      return deny('ACCEPTED_PROSPECT_REFERENCE_CONFLICT');
    }
    entries.push({
      evidence_id:evidenceId,
      question_id:questionId,
      prompt:questions.get(questionId).prompt,
      answer_kind:answer.answer_kind,
      selected_option_id:answer.selected_option_id??null,
      value:answer.value
    });
  }
  for(const question of pkg.questions) {
    if(question.required && !seen.has(question.question_id)) {
      return deny('ACCEPTED_PROSPECT_REQUIRED_ANSWER_MISSING');
    }
  }
  const binding={
    schema_version:'claris_accepted_prospect_manifest_v1',
    opportunity_id:envelope.opportunity_id,
    submitted_at:response.submitted_at,
    source_class:'PROSPECT_REPORTED',
    entries
  };
  return {ok:true,binding_sha256:digest(binding),entries};
}
