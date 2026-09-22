const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'icloud.com', 'proton.me', 'protonmail.com'
]);

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDomain(value) {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  const withoutScheme = raw.replace(/^https?:\/\//, '').replace(/^www\./, '');
  const host = withoutScheme.split(/[\/?#\s]/)[0].replace(/[^a-z0-9.-]/g, '');
  if (!host || !host.includes('.') || host.startsWith('.') || host.endsWith('.')) return null;
  return host;
}

function domainCandidates(value) {
  const source = text(value);
  if (!source) return [];
  const matches = source.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi) || [];
  return [...new Set(matches.map(normalizeDomain).filter(Boolean))];
}

function answerEntries(invitee) {
  return Array.isArray(invitee?.questions_and_answers)
    ? invitee.questions_and_answers
        .map((item) => ({
          question: text(item?.question),
          answer: text(item?.answer),
          position: Number.isFinite(item?.position) ? item.position : null
        }))
        .filter((item) => item.answer)
    : [];
}

function findAnswer(entries, patterns) {
  const item = entries.find(({ question }) => patterns.some((pattern) => pattern.test(question)));
  return item?.answer || null;
}

function explicitCompanyFromText(value) {
  const source = text(value);
  if (!source) return null;
  const patterns = [
    /\bmy company is\s+([^,\n.;]+)/i,
    /\bcompany\s*[:\-]\s*([^,\n.;]+)/i,
    /\borganization\s*[:\-]\s*([^,\n.;]+)/i,
    /\borganisation\s*[:\-]\s*([^,\n.;]+)/i
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return text(match[1]);
  }
  return null;
}

function explicitRoleFromText(value) {
  const source = text(value);
  if (!source) return null;
  const match = source.match(/\b(?:role|title)\s*[:\-]\s*([^,\n.;]+)/i);
  return match?.[1] ? text(match[1]) : null;
}

function companyFromDomain(domain) {
  const label = text(domain).split('.')[0];
  if (!label) return null;
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function firstName(invitee) {
  const direct = text(invitee?.first_name);
  if (direct) return direct;
  const full = text(invitee?.name);
  return full ? full.split(/\s+/)[0] : null;
}

function idFromUri(uri) {
  const value = text(uri);
  if (!value) return null;
  const parts = value.split('/').filter(Boolean);
  return parts.at(-1) || null;
}

export function normalizeCalendlyBooking({ event, invitee, consultant_id = null } = {}) {
  const entries = answerEntries(invitee);
  const combinedAnswers = entries.map(({ answer }) => answer).join('\n').trim();

  const explicitCompanyAnswer = findAnswer(entries, [
    /\bcompany\b/i,
    /\borganization\b/i,
    /\borganisation\b/i
  ]);
  const explicitDomainAnswer = findAnswer(entries, [
    /\bwebsite\b/i,
    /\bdomain\b/i,
    /\bcompany\s+(?:url|website)\b/i
  ]);
  const explicitRoleAnswer = findAnswer(entries, [
    /\brole\b/i,
    /\btitle\b/i,
    /\bjob\s+title\b/i
  ]);

  const domainFromExplicitAnswer = domainCandidates(explicitDomainAnswer)[0] || null;
  const domainFromCombined = domainCandidates(combinedAnswers)[0] || null;
  const emailDomain = normalizeDomain(text(invitee?.email).split('@')[1] || '');
  const domainFromEmail = emailDomain && !FREE_EMAIL_DOMAINS.has(emailDomain) ? emailDomain : null;
  const domain = domainFromExplicitAnswer || domainFromCombined || domainFromEmail || null;

  const company =
    text(explicitCompanyAnswer) ||
    explicitCompanyFromText(combinedAnswers) ||
    companyFromDomain(domain);

  const role =
    text(explicitRoleAnswer) ||
    explicitRoleFromText(combinedAnswers) ||
    null;

  const eventId = idFromUri(event?.uri || invitee?.event);
  const inviteeId = idFromUri(invitee?.uri);
  const opportunityId = inviteeId
    ? `calendly_${inviteeId}`
    : eventId
      ? `calendly_event_${eventId}`
      : null;

  const normalized = {
    consultant_id: text(consultant_id) || null,
    opportunity_id: opportunityId,
    prospect_first_name: firstName(invitee),
    prospect_email: text(invitee?.email) || null,
    prospect_role: role,
    company: company || null,
    domain: domain ? `https://${domain}` : null,
    meeting_time: text(event?.start_time) || null,
    meeting_source: 'CALENDLY',
    booking_text: combinedAnswers || null,
    calendly_event_uri: text(event?.uri || invitee?.event) || null,
    calendly_invitee_uri: text(invitee?.uri) || null
  };

  const missing = [
    ['consultant_id', normalized.consultant_id],
    ['opportunity_id', normalized.opportunity_id],
    ['prospect_first_name', normalized.prospect_first_name],
    ['prospect_email', normalized.prospect_email],
    ['company', normalized.company],
    ['domain', normalized.domain],
    ['meeting_time', normalized.meeting_time]
  ].filter(([, value]) => !value).map(([key]) => key);

  return {
    ok: missing.length === 0,
    error: missing.length ? 'CALENDLY_BOOKING_INCOMPLETE' : null,
    missing,
    booking: normalized,
    provenance: {
      company: explicitCompanyAnswer
        ? 'QUESTION_COMPANY'
        : explicitCompanyFromText(combinedAnswers)
          ? 'BOOKING_TEXT_EXPLICIT'
          : domain
            ? 'DOMAIN_LABEL'
            : null,
      domain: domainFromExplicitAnswer
        ? 'QUESTION_DOMAIN'
        : domainFromCombined
          ? 'BOOKING_TEXT_DOMAIN'
          : domainFromEmail
            ? 'INVITEE_EMAIL_DOMAIN'
            : null,
      role: explicitRoleAnswer
        ? 'QUESTION_ROLE'
        : explicitRoleFromText(combinedAnswers)
          ? 'BOOKING_TEXT_EXPLICIT'
          : null,
      booking_text: combinedAnswers ? 'CALENDLY_QUESTIONS_AND_ANSWERS' : null
    }
  };
}
