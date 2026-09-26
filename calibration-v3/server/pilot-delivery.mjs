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

function secureUrl(value, code) {
  const raw = required(value, code);
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') throw new Error(code);
    return parsed.href;
  } catch {
    throw new Error(code);
  }
}

function readableMarkdown(value) {
  return text(value)
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\x60([^\x60]+)\x60/g, '$1')
    .trim();
}

function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
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

function shortQuestionList(value) {
  if (value == null || value === '') return [];
  let items = value;
  if (typeof value === 'string') {
    try { items = JSON.parse(value); }
    catch { items = value.split(/\r?\n/); }
  }
  if (!Array.isArray(items)) throw new Error('PRIORITY_QUESTIONS_INVALID');
  return items
    .map((item) => typeof item === 'string' ? item.trim() : text(item?.ask || item?.question))
    .filter(Boolean)
    .slice(0, 3);
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
  const expiryLine = expiry ? '\nThis private link expires at ' + expiry + '.' : '';

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
    ].join('\n'),
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
    ? 'Hi ' + consultantFirstName + ',\n\nCLARIS has finished preparing this opportunity.'
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
    ].filter((value) => value !== null).join('\n'),
    metadata: {
      opportunity_id: text(input.opportunity_id) || null,
      company,
      prospect_name: prospect || null,
      meeting_time: meeting
    }
  };
}

export function buildConsultantBriefReadyDelivery(input = {}) {
  const recipient = validEmail(input.consultant_delivery_email);
  if (!recipient) throw new Error('CONSULTANT_DELIVERY_EMAIL_REQUIRED');
  const company = required(input.company, 'COMPANY_REQUIRED');
  const briefUrl = secureUrl(input.brief_url, 'PRIVATE_BRIEF_URL_REQUIRED');
  const readout = readableMarkdown(required(input.executive_readout, 'EXECUTIVE_READOUT_REQUIRED'));
  const prospect = text(input.prospect_name || input.prospect_first_name);
  const consultantFirstName = text(input.consultant_first_name);
  const meeting = meetingLine(input.meeting_time);
  const questions = shortQuestionList(input.priority_questions_json ?? input.priority_questions);
  const expiry = text(input.expires_at);
  const heading = prospect ? company + ' / ' + prospect : company;
  const intro = consultantFirstName
    ? 'Hi ' + consultantFirstName + ',\n\nYour CLARIS pre-call intelligence is ready.'
    : 'Your CLARIS pre-call intelligence is ready.';

  const questionLines = questions.length
    ? ['', 'Resolve on the call:', ...questions.map((question) => '• ' + question)]
    : [];

  const htmlQuestions = questions.length
    ? '<div style="margin:24px 0 0"><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#66716d;margin-bottom:10px">Resolve on the call</div>' +
      questions.map((question, index) =>
        '<div style="display:flex;gap:10px;margin:10px 0;color:#17201d"><span style="display:inline-block;min-width:24px;height:24px;line-height:24px;text-align:center;border-radius:999px;background:#e8efeb;color:#345c55;font-weight:700;font-size:12px">' +
        (index + 1) + '</span><span style="line-height:1.5">' + htmlEscape(question) + '</span></div>'
      ).join('') +
      '</div>'
    : '';

  const html_body = '<!doctype html><html><body style="margin:0;padding:0;background:#f1f3f0;color:#17201d;font-family:Inter,Arial,sans-serif">' +
    '<div style="max-width:620px;margin:0 auto;padding:32px 18px 42px">' +
      '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#66716d;margin-bottom:14px">CLARIS · Private opportunity intelligence</div>' +
      '<div style="background:#fbfcfa;border:1px solid #dce2de;border-radius:18px;padding:28px">' +
        (consultantFirstName ? '<p style="margin:0 0 8px;font-size:14px;color:#66716d">Hi ' + htmlEscape(consultantFirstName) + ',</p>' : '') +
        '<h1 style="margin:0 0 6px;font-size:25px;line-height:1.2;color:#17201d">' + htmlEscape(heading) + '</h1>' +
        '<p style="margin:0 0 22px;font-size:13px;color:#66716d">Your CLARIS pre-call intelligence is ready.' +
          (meeting ? ' · Meeting: ' + htmlEscape(meeting) : '') +
        '</p>' +
        '<div style="padding:18px 20px;background:#e8efeb;border-radius:13px;font-size:16px;line-height:1.55;color:#17201d">' + htmlEscape(readout) + '</div>' +
        htmlQuestions +
        '<div style="margin-top:28px"><a href="' + htmlEscape(briefUrl) + '" style="display:inline-block;background:#345c55;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">Open private brief</a></div>' +
        (expiry ? '<p style="margin:14px 0 0;font-size:11px;color:#66716d">Private link expires: ' + htmlEscape(expiry) + '</p>' : '') +
      '</div>' +
      '<p style="margin:14px 4px 0;font-size:11px;color:#7a8581">The full evidence trail, diagnostic branches and conditional service logic stay inside the private brief.</p>' +
    '</div></body></html>';

  return {
    schema_version: 'claris_delivery_package_v1',
    kind: 'CONSULTANT_BRIEF_READY',
    channel: 'EMAIL',
    to: recipient,
    subject: 'CLARIS — ' + heading + ' brief ready',
    text_body: [
      intro,
      meeting ? 'Meeting: ' + meeting : null,
      '',
      readout,
      ...questionLines,
      '',
      'Open private brief: ' + briefUrl,
      expiry ? 'Private link expires: ' + expiry : null
    ].filter((value) => value !== null).join('\n'),
    html_body,
    metadata: {
      opportunity_id: text(input.opportunity_id) || null,
      brief_id: text(input.brief_id) || null,
      company,
      prospect_name: prospect || null,
      meeting_time: meeting,
      priority_question_count: questions.length,
      expires_at: expiry || null
    }
  };
}

export function buildDeliveryPackage(operation, input = {}) {
  const kind = text(operation).toUpperCase();
  if (kind === 'PROSPECT_CLARIFICATION') return buildProspectClarificationDelivery(input);
  if (kind === 'CONSULTANT_FINAL') return buildConsultantFinalDelivery(input);
  if (kind === 'CONSULTANT_BRIEF_READY') return buildConsultantBriefReadyDelivery(input);
  throw new Error('DELIVERY_OPERATION_INVALID');
}
