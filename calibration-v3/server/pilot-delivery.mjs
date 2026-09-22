function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function required(value, code) {
  const result = text(value);
  if (!result) throw new Error(code);
  return result;
}

function validEmail(value) {
  const email = text(value).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function readableMarkdown(value) {
  return text(value)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function questionCount(input) {
  const explicit = Number(input?.question_count);
  if (Number.isInteger(explicit) && explicit >= 0) return explicit;

  const raw = input?.clarification_package_json;
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const questions = parsed?.questions || parsed?.clarification_package?.questions;
    return Array.isArray(questions) ? questions.length : null;
  } catch {
    return null;
  }
}

function meetingLine(value) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

export function buildProspectClarificationDelivery(input = {}) {
  const recipient = validEmail(input.prospect_email);
  if (!recipient) throw new Error('PROSPECT_EMAIL_REQUIRED');
  const prospectFirstName = required(input.prospect_first_name, 'PROSPECT_FIRST_NAME_REQUIRED');
  const consultantFirstName = required(input.consultant_first_name, 'CONSULTANT_FIRST_NAME_REQUIRED');
  const inviteUrl = required(input.invite_url, 'CLARIFICATION_INVITE_URL_REQUIRED');
  const count = questionCount(input);
  if (!Number.isInteger(count) || count <= 0) throw new Error('CLARIFICATION_QUESTION_COUNT_REQUIRED');

  const plural = count === 1 ? 'detail' : 'details';
  const pronoun = count === 1 ? 'it' : 'them';
  const expiry = text(input.expires_at);
  const expiryLine = expiry ? '
This private link expires at ' + expiry + '.' : '';

  return {
    schema_version: 'claris_delivery_package_v1',
    kind: 'PROSPECT_CLARIFICATION',
    channel: 'EMAIL',
    to: recipient,
    subject: 'A quick check before your conversation with ' + consultantFirstName,
    text_body: [
      'Hi ' + prospectFirstName + ',',
      '',
      consultantFirstName + ' is getting ready for your conversation.',
      'We already have most of the context. There ' + (count === 1 ? 'is' : 'are') + ' just ' + count + ' quick ' + plural + ' we could not establish reliably without asking you directly.',
      '',
      'Answer ' + (count === 1 ? 'the quick question' : 'the ' + count + ' quick questions') + ': ' + inviteUrl,
      '',
      'Once you send ' + pronoun + ', there is nothing else you need to prepare here.' + expiryLine
    ].join('
'),
    metadata: {
      opportunity_id: text(input.opportunity_id) || null,
      question_count: count,
      expires_at: expiry || null
    }
  };
}

export function buildConsultantFinalDelivery(input = {}) {
  const recipient = validEmail(input.consultant_delivery_email);
  if (!recipient) throw new Error('CONSULTANT_DELIVERY_EMAIL_REQUIRED');
  const company = required(input.company, 'COMPANY_REQUIRED');
  const brief = readableMarkdown(required(input.final_brief_markdown, 'FINAL_BRIEF_REQUIRED'));
  const prospect = text(input.prospect_name || input.prospect_first_name);
  const meeting = meetingLine(input.meeting_time);
  const consultantFirstName = text(input.consultant_first_name);

  const heading = prospect ? company + ' / ' + prospect : company;
  const intro = consultantFirstName
    ? 'Hi ' + consultantFirstName + ',

CLARIS has finished preparing this opportunity.'
    : 'CLARIS has finished preparing this opportunity.';

  return {
    schema_version: 'claris_delivery_package_v1',
    kind: 'CONSULTANT_FINAL',
    channel: 'EMAIL',
    to: recipient,
    subject: 'CLARIS — ' + heading,
    text_body: [
      intro,
      meeting ? 'Meeting: ' + meeting : null,
      '',
      brief
    ].filter((value) => value !== null).join('
'),
    metadata: {
      opportunity_id: text(input.opportunity_id) || null,
      company,
      prospect_name: prospect || null,
      meeting_time: meeting
    }
  };
}

export function buildDeliveryPackage(operation, input = {}) {
  const kind = text(operation).toUpperCase();
  if (kind === 'PROSPECT_CLARIFICATION') return buildProspectClarificationDelivery(input);
  if (kind === 'CONSULTANT_FINAL') return buildConsultantFinalDelivery(input);
  throw new Error('DELIVERY_OPERATION_INVALID');
}
