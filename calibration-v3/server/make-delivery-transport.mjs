import { json } from './http.mjs';

// Make's native HTTP form encoding escapes untrusted values (quotes, line
// breaks, '&', '='). Accept it only for explicitly declared, authenticated
// delivery operations, never for general administration or AI protocols.
const MAX_BYTES = 450_000;
const FORM_CONTENT_TYPE = /^application\/x-www-form-urlencoded(?:\s*;|$)/i;

export const DIRECT_FINAL_FORM_FIELDS = Object.freeze({
  direct_final_begin: [
    'opportunity_id', 'consultant_id', 'consultant_delivery_email',
    'consultant_sot_json', 'company', 'prospect_first_name',
    'prospect_email', 'meeting_time', 'domain'
  ],
  direct_final_claim: [
    'opportunity_id', 'consultant_id', 'consultant_delivery_email',
    'consultant_sot_json', 'company', 'prospect_first_name',
    'prospect_email', 'meeting_time', 'domain', 'registration_token',
    'status', 'final_stage', 'requires_clarification', 'final_audit_json',
    'final_brief_markdown', 'consultant_first_name'
  ],
  direct_final_ack: [
    'opportunity_id', 'claim_token', 'provider_message_id'
  ]
});
export const SUBMITTED_FINAL_FORM_FIELDS = Object.freeze({
  FINAL_DELIVERY_PREFLIGHT: ['opportunity_id'],
  FINAL_DELIVERY_CLAIM: [
    'opportunity_id', 'status', 'final_brief_markdown', 'final_audit_json'
  ],
  FINAL_DELIVERY_ACK: ['opportunity_id', 'claim_token', 'provider_message_id']
});

function refusal(code, status = 422) {
  return { ok: false, response: json({ ok: false, error: code }, status) };
}

export async function parseMakeDeliveryInput(
  request, parseLegacyJson, allowedFormFields, { maxBytes = MAX_BYTES } = {}
) {
  const contentType = String(request.headers.get('content-type') || '').trim();
  if (!FORM_CONTENT_TYPE.test(contentType)) {
    return parseLegacyJson(request);
  }
  // Form support is intentionally unavailable for generic and intelligence
  // operations even when the request carries a valid Make API key.
  if (!Array.isArray(allowedFormFields)) {
    return refusal('DELIVERY_FORM_OPERATION_UNSUPPORTED', 415);
  }
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > maxBytes) return refusal('REQUEST_TOO_LARGE', 413);
  let raw;
  try { raw = await request.text(); }
  catch { return refusal('DELIVERY_FORM_READ_FAILED', 400); }
  if (new TextEncoder().encode(raw).length > maxBytes) {
    return refusal('REQUEST_TOO_LARGE', 413);
  }

  const permitted = new Set(allowedFormFields);
  const value = Object.create(null);
  let total = 0;
  for (const [key, field] of new URLSearchParams(raw)) {
    total += 1;
    if (total > permitted.size || !permitted.has(key) ||
        Object.hasOwn(value, key) || field.includes('\0')) {
      return refusal('DELIVERY_FORM_FIELD_INVALID');
    }
    if (key === 'requires_clarification') {
      if (field !== 'true' && field !== 'false') {
        return refusal('DELIVERY_FORM_BOOLEAN_INVALID');
      }
      value[key] = field === 'true';
    } else {
      value[key] = field;
    }
  }
  return { ok: true, value };
}
