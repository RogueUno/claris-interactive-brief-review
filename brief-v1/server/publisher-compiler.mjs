function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function required(value, code) {
  const result = text(value);
  if (!result) throw new Error(code);
  return result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compactServices(sot = {}) {
  const services = Array.isArray(sot.services) ? sot.services : [];
  return services
    .map((service) => ({
      service_id: text(service?.service_id),
      name: text(service?.name)
    }))
    .filter((service) => service.service_id && service.name);
}

function assertCertifiedSchemas(prepare, discovery) {
  if (prepare?.schema_version !== 'CLARIS_PREMIUM_PREPARE_V3_6') throw new Error('PREPARE_V3_6_REQUIRED');
  if (discovery?.schema_version !== 'CLARIS_DISCOVERY_INTELLIGENCE_V1_2') throw new Error('DISCOVERY_V1_2_REQUIRED');
}

export function compileBriefPublishRequest(input = {}) {
  const consultantId = required(input.consultant_id, 'CONSULTANT_ID_REQUIRED');
  const company = required(input.company, 'COMPANY_REQUIRED');
  const prepare = input.prepare;
  const discovery = input.discovery;
  const sot = input.consultant_sot || {};
  assertCertifiedSchemas(prepare, discovery);

  const services = compactServices(sot);
  if (!services.length) throw new Error('CONSULTANT_SERVICES_REQUIRED');

  const ttlDays = Number(input.ttl_days ?? 7);
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 30) throw new Error('BRIEF_TTL_DAYS_INVALID');

  return {
    operation: 'brief_create',
    consultant_id: consultantId,
    company,
    brief_payload: {
      prepare: clone(prepare),
      discovery: clone(discovery)
    },
    validation_context: {
      services,
      commercial_rules: {
        budget_required_before_first_call: sot?.commercial_rules?.budget_required_before_first_call === true
      }
    },
    ttl_days: ttlDays
  };
}

export function compileBriefReadyNotification(input = {}) {
  const publish = input.publish_result || {};
  if (publish.ok !== true) throw new Error('PUBLISH_RESULT_REQUIRED');
  const briefUrl = required(publish.brief_url, 'PRIVATE_BRIEF_URL_REQUIRED');
  const briefId = required(publish.brief_id, 'BRIEF_ID_REQUIRED');
  const expiresAt = required(publish.expires_at, 'BRIEF_EXPIRY_REQUIRED');

  const prepare = input.prepare;
  const discovery = input.discovery;
  assertCertifiedSchemas(prepare, discovery);

  const recipient = required(input.consultant_delivery_email, 'CONSULTANT_DELIVERY_EMAIL_REQUIRED');
  const company = required(input.company, 'COMPANY_REQUIRED');
  const executiveReadout = required(prepare.executive_readout, 'EXECUTIVE_READOUT_REQUIRED');
  const questions = Array.isArray(discovery.primary_questions)
    ? discovery.primary_questions.map((item) => text(item?.ask)).filter(Boolean)
    : [];

  if (!questions.length) throw new Error('PRIORITY_QUESTIONS_REQUIRED');

  return {
    operation: 'CONSULTANT_BRIEF_READY',
    consultant_delivery_email: recipient,
    consultant_first_name: text(input.consultant_first_name) || null,
    company,
    prospect_name: text(input.prospect_name) || null,
    meeting_time: text(input.meeting_time) || null,
    opportunity_id: text(input.opportunity_id) || null,
    brief_id: briefId,
    brief_url: briefUrl,
    expires_at: expiresAt,
    executive_readout: executiveReadout,
    priority_questions: questions
  };
}

export function compilePrivateBriefDelivery(input = {}) {
  return {
    publish: compileBriefPublishRequest(input),
    notification_after_publish: {
      compile_with: 'compileBriefReadyNotification',
      required_publish_fields: ['ok', 'brief_id', 'brief_url', 'expires_at']
    }
  };
}
