import { normalizeClarificationPackage } from './contract.mjs';
import { auditClarificationDraft, buildClarificationRepairPlan } from './governance.mjs';
import {
  evidenceIndex,
  normalizeClarificationEvidenceBundle,
  publicEvidenceView
} from './evidence.mjs';

const SEMANTIC_VERDICTS = new Set(['PASS', 'FAIL']);
const MAX_REPAIRS = 2;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function issue(code, path, detail, evidenceIds = []) {
  return {
    code,
    path,
    detail,
    evidence_ids: [...new Set(evidenceIds.map((value) => String(value || '').trim()).filter(Boolean))]
  };
}

function normalizeProposal(proposal) {
  return {
    schema_version: 'claris_clarification_proposal_v1',
    decision: String(proposal?.decision || '').trim().toUpperCase(),
    decision_basis_ids: safeArray(proposal?.decision_basis_ids),
    decision_rationale: String(proposal?.decision_rationale || '').trim(),
    intro_context: proposal?.intro_context == null ? null : String(proposal.intro_context).trim(),
    questions: safeArray(proposal?.questions).map((question) => copy(question))
  };
}

function materializeProposal(bundle, proposal) {
  const index = evidenceIndex(bundle);
  const violations = [];
  const normalized = normalizeProposal(proposal);

  if (!['ASK', 'SKIP'].includes(normalized.decision)) {
    violations.push(issue('DECISION_INVALID', 'decision', 'Decision must be ASK or SKIP.'));
  }
  if (normalized.decision === 'SKIP' && normalized.questions.length) {
    violations.push(issue('SKIP_HAS_QUESTIONS', 'questions', 'SKIP decisions cannot include prospect questions.'));
  }
  if (normalized.decision === 'ASK' && normalized.questions.length === 0) {
    violations.push(issue('ASK_HAS_NO_QUESTIONS', 'questions', 'ASK decisions require at least one prospect question.'));
  }

  for (const basisId of normalized.decision_basis_ids) {
    if (!index.has(String(basisId || '').trim())) {
      violations.push(issue('DECISION_BASIS_UNKNOWN', 'decision_basis_ids', `Unknown decision basis: ${basisId}`));
    }
  }

  const questions = normalized.questions.map((question, questionIndex) => {
    const evidenceIds = [...new Set(safeArray(question?.evidence_ids).map((value) => String(value || '').trim()).filter(Boolean))];
    const refs = [];

    for (const evidenceId of evidenceIds) {
      const evidence = index.get(evidenceId);
      if (!evidence) {
        violations.push(issue(
          'QUESTION_EVIDENCE_UNKNOWN',
          `questions[${questionIndex}].evidence_ids`,
          `Unknown evidence ID: ${evidenceId}`,
          [evidenceId]
        ));
        continue;
      }
      refs.push({
        evidence_id: evidence.evidence_id,
        source_type: evidence.source_type,
        subject: evidence.subject,
        ref: evidence.ref
      });
    }

    safeArray(question?.options).forEach((option, optionIndex) => {
      const basisIds = safeArray(option?.basis_ids).map((value) => String(value || '').trim()).filter(Boolean);
      for (const basisId of basisIds) {
        const evidence = index.get(basisId);
        if (!evidence) {
          violations.push(issue(
            'OPTION_BASIS_UNKNOWN',
            `questions[${questionIndex}].options[${optionIndex}].basis_ids`,
            `Unknown evidence basis: ${basisId}`,
            [basisId]
          ));
          continue;
        }
        if (!evidenceIds.includes(basisId)) {
          violations.push(issue(
            'OPTION_BASIS_NOT_IN_QUESTION',
            `questions[${questionIndex}].options[${optionIndex}].basis_ids`,
            `Option basis ${basisId} is not declared on its question.`,
            [basisId]
          ));
        }
        if (evidence.visibility === 'INTERNAL_ONLY') {
          violations.push(issue(
            'OPTION_USES_INTERNAL_ONLY_EVIDENCE',
            `questions[${questionIndex}].options[${optionIndex}].basis_ids`,
            'Prospect-visible options cannot be grounded directly in internal-only evidence.',
            [basisId]
          ));
        }
      }
    });

    return {
      question_id: question?.question_id,
      mode: question?.mode,
      prompt: question?.prompt,
      display_context: question?.display_context ?? null,
      response_type: question?.response_type,
      options: copy(question?.options || []),
      allow_other: question?.allow_other,
      allow_unsure: question?.allow_unsure,
      friction_exception: copy(question?.friction_exception || null),
      required: question?.required !== false,
      evidence_refs: refs
    };
  });

  const draft = {
    opportunity_id: bundle.opportunity_id,
    consultant: copy(bundle.consultant),
    prospect: copy(bundle.prospect),
    intro_context: normalized.intro_context,
    questions
  };

  const governance = auditClarificationDraft(draft);
  violations.push(...safeArray(governance.violations));

  return {
    proposal: normalized,
    draft,
    governance,
    violations
  };
}

function validateSemanticReport(bundle, report) {
  const index = evidenceIndex(bundle);
  const verdict = String(report?.verdict || '').trim().toUpperCase();
  const issues = [];
  const structural = [];

  if (!SEMANTIC_VERDICTS.has(verdict)) {
    structural.push(issue('VERIFIER_VERDICT_INVALID', 'verdict', 'Verifier verdict must be PASS or FAIL.'));
  }

  safeArray(report?.issues).forEach((item, indexPosition) => {
    const evidenceIds = safeArray(item?.evidence_ids).map((value) => String(value || '').trim()).filter(Boolean);
    for (const evidenceId of evidenceIds) {
      if (!index.has(evidenceId)) {
        structural.push(issue(
          'VERIFIER_EVIDENCE_UNKNOWN',
          `issues[${indexPosition}].evidence_ids`,
          `Verifier referenced unknown evidence: ${evidenceId}`,
          [evidenceId]
        ));
      }
    }

    issues.push(issue(
      String(item?.code || 'SEMANTIC_ISSUE').trim().toUpperCase(),
      String(item?.path || 'proposal').trim(),
      String(item?.detail || 'Semantic verification failed.').trim(),
      evidenceIds
    ));
  });

  if (verdict === 'PASS' && issues.length) {
    structural.push(issue('VERIFIER_PASS_WITH_ISSUES', 'issues', 'PASS verdict cannot contain semantic issues.'));
  }
  if (verdict === 'FAIL' && issues.length === 0) {
    structural.push(issue('VERIFIER_FAIL_WITHOUT_ISSUES', 'issues', 'FAIL verdict must contain at least one actionable issue.'));
  }

  return {
    ok: structural.length === 0 && verdict === 'PASS',
    schema_version: 'claris_clarification_semantic_verification_v1',
    verdict,
    issues,
    structural_issues: structural
  };
}

function mergeIssues(materialized, semantic) {
  return [
    ...safeArray(materialized?.violations),
    ...safeArray(semantic?.structural_issues),
    ...safeArray(semantic?.issues)
  ];
}

function repairPlanFromIssues(issues) {
  return {
    schema_version: 'claris_clarification_intelligence_repair_v1',
    repair_required: issues.length > 0,
    instructions: issues.map((item) => ({
      code: item.code,
      path: item.path,
      instruction: item.detail,
      evidence_ids: copy(item.evidence_ids || [])
    }))
  };
}

export function createClarificationIntelligence({
  proposer,
  verifier,
  repairer,
  maxRepairs = 1
}) {
  if (typeof proposer !== 'function') throw new Error('CLARIFICATION_PROPOSER_REQUIRED');
  if (typeof verifier !== 'function') throw new Error('CLARIFICATION_VERIFIER_REQUIRED');
  if (typeof repairer !== 'function') throw new Error('CLARIFICATION_REPAIRER_REQUIRED');
  if (!Number.isInteger(maxRepairs) || maxRepairs < 0 || maxRepairs > MAX_REPAIRS) {
    throw new Error('CLARIFICATION_MAX_REPAIRS_INVALID');
  }

  return {
    async plan(input, { now = Date.now(), ttlMs } = {}) {
      const bundle = normalizeClarificationEvidenceBundle(input);
      const modelEvidence = publicEvidenceView(bundle);
      const trace = [];
      let proposal = await proposer({
        schema_version: 'claris_clarification_proposer_request_v1',
        friction_policy: {
          prefer_guided_choices: true,
          max_questions: 4,
          max_authored_options: 5,
          free_text_exceptional: true
        },
        evidence_bundle: modelEvidence
      });

      for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
        const materialized = materializeProposal(bundle, proposal);

        let semantic = {
          ok: false,
          verdict: 'FAIL',
          issues: [],
          structural_issues: []
        };

        if (materialized.violations.length === 0) {
          const rawVerification = await verifier({
            schema_version: 'claris_clarification_verifier_request_v1',
            evidence_bundle: modelEvidence,
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
          });
          semantic = validateSemanticReport(bundle, rawVerification);
        }

        const issues = mergeIssues(materialized, semantic);
        trace.push({
          attempt,
          proposal: copy(materialized.proposal),
          deterministic_governance: copy(materialized.governance),
          semantic_verification: copy(semantic),
          issues: copy(issues)
        });

        if (issues.length === 0 && semantic.ok) {
          const pkg = normalizeClarificationPackage(materialized.draft, {
            now,
            ...(ttlMs ? { ttlMs } : {})
          });
          return {
            ok: true,
            status: pkg.questions.length ? 'READY' : 'NO_CLARIFICATION',
            schema_version: 'claris_clarification_intelligence_result_v1',
            package: pkg,
            trace
          };
        }

        if (attempt >= maxRepairs) {
          return {
            ok: false,
            status: 'BLOCKED',
            error: 'CLARIFICATION_INTELLIGENCE_BLOCKED',
            schema_version: 'claris_clarification_intelligence_result_v1',
            repair_plan: repairPlanFromIssues(issues),
            trace
          };
        }

        proposal = await repairer({
          schema_version: 'claris_clarification_repair_request_v1',
          evidence_bundle: modelEvidence,
          prior_proposal: copy(materialized.proposal),
          repair_plan: repairPlanFromIssues(issues)
        });
      }

      throw new Error('CLARIFICATION_INTELLIGENCE_UNREACHABLE');
    }
  };
}

export const clarificationIntelligenceInternals = Object.freeze({
  max_repairs: MAX_REPAIRS
});
