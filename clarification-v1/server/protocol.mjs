import { normalizeClarificationPackage } from './contract.mjs';
import { publicEvidenceView } from './evidence.mjs';
import {
  buildClarificationIntelligenceRepairPlan,
  materializeClarificationProposal,
  mergeClarificationIssues,
  validateClarificationSemanticReport
} from './intelligence.mjs';
import {
  buildClarificationProposerMessages,
  buildClarificationRepairMessages,
  buildClarificationVerifierMessages
} from './model-prompts.mjs';
import { adaptCertifiedPrepareToClarificationEvidence } from './prepare-adapter.mjs';

const ACTIONS = new Set([
  'START',
  'PROPOSAL',
  'VERIFICATION',
  'REPAIRED_PROPOSAL',
  'REPAIRED_VERIFICATION'
]);

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function objectValue(value, field) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  const raw = String(value || '').trim();
  if (!raw) throw new Error(`${field}_REQUIRED`);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not-object');
    return parsed;
  } catch {
    throw new Error(`${field}_INVALID_JSON`);
  }
}

function actionValue(value) {
  const action = String(value || '').trim().toUpperCase();
  if (!ACTIONS.has(action)) throw new Error('CLARIFICATION_PROTOCOL_ACTION_INVALID');
  return action;
}

function ttlMs(input) {
  const days = Number(input?.ttl_days ?? 7);
  if (!Number.isFinite(days) || days < 1 || days > 30) {
    throw new Error('CLARIFICATION_TTL_INVALID');
  }
  return Math.round(days * 24 * 60 * 60 * 1000);
}

function modelRequest(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const system = list.find((item) => item?.role === 'system')?.content || '';
  const user = list.find((item) => item?.role === 'user')?.content || '';
  return {
    system_instruction: system,
    user_prompt: user,
    temperature: 0,
    response_format: 'json_object'
  };
}

function contextFromInput(input) {
  const bundle = adaptCertifiedPrepareToClarificationEvidence({
    opportunity_id: input?.opportunity_id,
    case_state_json: input?.case_state_json ?? input?.stage_output_json,
    consultant: input?.consultant,
    prospect: input?.prospect
  });
  return {
    bundle,
    model_evidence: publicEvidenceView(bundle)
  };
}

function repairResponse(context, proposal, issues, phase) {
  const repairPlan = buildClarificationIntelligenceRepairPlan(issues);
  const request = {
    schema_version: 'claris_clarification_repair_request_v1',
    evidence_bundle: context.model_evidence,
    prior_proposal: copy(proposal),
    repair_plan: copy(repairPlan)
  };
  return {
    ok: true,
    status: 'NEEDS_REPAIR',
    next_action: phase === 'REPAIRED' ? 'BLOCKED' : 'REPAIR',
    repair_plan: repairPlan,
    model_request: phase === 'REPAIRED'
      ? null
      : modelRequest(buildClarificationRepairMessages(request))
  };
}

function finalResponse(context, materialized, semantic, input, now) {
  const pkg = normalizeClarificationPackage(materialized.draft, {
    now,
    ttlMs: ttlMs(input)
  });
  const audit = {
    schema_version: 'claris_clarification_protocol_audit_v1',
    deterministic_governance: copy(materialized.governance),
    semantic_verification: copy(semantic),
    prepare_certification: copy(context.bundle.prepare_certification)
  };
  return {
    ok: true,
    status: pkg.questions.length ? 'READY' : 'NO_CLARIFICATION',
    next_action: 'RETURN',
    clarification_package: pkg,
    clarification_package_json: JSON.stringify(pkg),
    intelligence_audit: audit,
    intelligence_audit_json: JSON.stringify(audit),
    failure_json: ''
  };
}

function blockedResponse(body) {
  const value = {
    ok: false,
    status: 'BLOCKED',
    next_action: 'BLOCKED',
    error: 'CLARIFICATION_INTELLIGENCE_BLOCKED',
    ...body
  };
  return {
    ...value,
    clarification_package_json: '',
    intelligence_audit_json: '',
    failure_json: JSON.stringify(value)
  };
}

export function runClarificationProtocolStep(input, { now = Date.now() } = {}) {
  const action = actionValue(input?.action);
  const context = contextFromInput(input);

  if (action === 'START') {
    const request = {
      schema_version: 'claris_clarification_proposer_request_v1',
      friction_policy: {
        prefer_guided_choices: true,
        max_questions: 4,
        max_authored_options: 5,
        free_text_exceptional: true
      },
      evidence_bundle: context.model_evidence
    };
    return {
      ok: true,
      status: 'READY_TO_PROPOSE',
      next_action: 'PROPOSE',
      model_request: modelRequest(buildClarificationProposerMessages(request)),
      prepare_certification: copy(context.bundle.prepare_certification)
    };
  }

  const proposal = objectValue(
    input?.proposal ?? input?.proposal_json,
    action.startsWith('REPAIRED_') ? 'REPAIRED_PROPOSAL' : 'PROPOSAL'
  );
  const materialized = materializeClarificationProposal(context.bundle, proposal);

  if (materialized.violations.length) {
    const phase = action.startsWith('REPAIRED_') ? 'REPAIRED' : 'ORIGINAL';
    const response = repairResponse(context, materialized.proposal, materialized.violations, phase);
    if (response.next_action === 'BLOCKED') {
      return blockedResponse({
        repair_plan: copy(response.repair_plan),
        deterministic_governance: copy(materialized.governance)
      });
    }
    return {
      ...response,
      deterministic_governance: copy(materialized.governance)
    };
  }

  if (action === 'PROPOSAL' || action === 'REPAIRED_PROPOSAL') {
    const request = {
      schema_version: 'claris_clarification_verifier_request_v1',
      evidence_bundle: context.model_evidence,
      proposal: copy(materialized.proposal),
      materialized_draft: copy(materialized.draft),
      checks: [
        'Every prospect-visible factual implication is supported by supplied evidence.',
        'Inferences are plausible but are not phrased as established facts.',
        'Booking information is not silently promoted beyond what the prospect actually stated.',
        'Internal-only evidence is not exposed or paraphrased in a creepy or confrontational way.',
        'Questions resolve decision-relevant uncertainty rather than re-asking known facts.',
        'Suggested choices are distinct, non-leading, and collectively reasonable.',
        'Zero-question decisions are allowed when the evidence is already sufficient.'
      ]
    };
    return {
      ok: true,
      status: 'READY_TO_VERIFY',
      next_action: action === 'REPAIRED_PROPOSAL' ? 'VERIFY_REPAIRED' : 'VERIFY',
      model_request: modelRequest(buildClarificationVerifierMessages(request)),
      normalized_proposal: materialized.proposal,
      deterministic_governance: materialized.governance
    };
  }

  const verification = objectValue(
    input?.verification ?? input?.verification_json,
    action === 'REPAIRED_VERIFICATION' ? 'REPAIRED_VERIFICATION' : 'VERIFICATION'
  );
  const semantic = validateClarificationSemanticReport(context.bundle, verification);
  const issues = mergeClarificationIssues(materialized, semantic);

  if (!issues.length && semantic.ok) {
    return finalResponse(context, materialized, semantic, input, now);
  }

  if (action === 'REPAIRED_VERIFICATION') {
    return blockedResponse({
      repair_plan: buildClarificationIntelligenceRepairPlan(issues),
      deterministic_governance: copy(materialized.governance),
      semantic_verification: copy(semantic)
    });
  }

  return {
    ...repairResponse(context, materialized.proposal, issues, 'ORIGINAL'),
    deterministic_governance: materialized.governance,
    semantic_verification: semantic
  };
}

export const clarificationProtocolActions = Object.freeze([...ACTIONS]);
