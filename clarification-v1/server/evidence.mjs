const SOURCE_TYPES = new Set(['PUBLIC_WEB', 'BOOKING', 'CONSULTANT_INPUT', 'OTHER']);
const SUBJECTS = new Set(['PROSPECT', 'COMPANY', 'OPPORTUNITY']);
const VISIBILITY = new Set(['PROSPECT_SAFE', 'INTERNAL_ONLY']);

function requiredText(value, field, max = 500) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field}_REQUIRED`);
  if (text.length > max) throw new Error(`${field}_TOO_LONG`);
  return text;
}

function optionalText(value, field, max = 500) {
  if (value == null || String(value).trim() === '') return null;
  return requiredText(value, field, max);
}

function stableId(value, field) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(id)) throw new Error(`${field}_INVALID`);
  return id;
}

function normalizeEvidenceItem(item, index) {
  const sourceType = String(item?.source_type || '').trim().toUpperCase();
  const subject = String(item?.subject || '').trim().toUpperCase();
  const visibility = String(item?.visibility || 'PROSPECT_SAFE').trim().toUpperCase();

  if (!SOURCE_TYPES.has(sourceType)) throw new Error(`EVIDENCE_${index}_SOURCE_INVALID`);
  if (!SUBJECTS.has(subject)) throw new Error(`EVIDENCE_${index}_SUBJECT_INVALID`);
  if (!VISIBILITY.has(visibility)) throw new Error(`EVIDENCE_${index}_VISIBILITY_INVALID`);

  return {
    evidence_id: stableId(item?.evidence_id, `EVIDENCE_${index}_ID`),
    source_type: sourceType,
    subject,
    visibility,
    statement: requiredText(item?.statement, `EVIDENCE_${index}_STATEMENT`, 1200),
    ref: requiredText(item?.ref, `EVIDENCE_${index}_REF`, 800),
    observed_at: optionalText(item?.observed_at, `EVIDENCE_${index}_OBSERVED_AT`, 80)
  };
}

export function normalizeClarificationEvidenceBundle(input) {
  const evidence = Array.isArray(input?.evidence)
    ? input.evidence.map(normalizeEvidenceItem)
    : [];

  if (new Set(evidence.map((item) => item.evidence_id)).size !== evidence.length) {
    throw new Error('EVIDENCE_IDS_DUPLICATE');
  }

  return {
    schema_version: 'claris_clarification_evidence_bundle_v1',
    opportunity_id: stableId(input?.opportunity_id, 'OPPORTUNITY_ID'),
    consultant: {
      consultant_id: stableId(input?.consultant?.consultant_id, 'CONSULTANT_ID'),
      first_name: requiredText(input?.consultant?.first_name, 'CONSULTANT_FIRST_NAME', 100),
      firm: requiredText(input?.consultant?.firm, 'CONSULTANT_FIRM', 160)
    },
    prospect: {
      first_name: requiredText(input?.prospect?.first_name, 'PROSPECT_FIRST_NAME', 100),
      role: optionalText(input?.prospect?.role, 'PROSPECT_ROLE', 160),
      company: requiredText(input?.prospect?.company, 'PROSPECT_COMPANY', 180)
    },
    evidence
  };
}

export function evidenceIndex(bundle) {
  return new Map((bundle?.evidence || []).map((item) => [item.evidence_id, item]));
}

export function publicEvidenceView(bundle) {
  return {
    ...bundle,
    evidence: (bundle?.evidence || []).map((item) => ({
      evidence_id: item.evidence_id,
      source_type: item.source_type,
      subject: item.subject,
      visibility: item.visibility,
      statement: item.statement
    }))
  };
}

export const clarificationEvidenceContract = Object.freeze({
  source_types: [...SOURCE_TYPES],
  subjects: [...SUBJECTS],
  visibility: [...VISIBILITY]
});
