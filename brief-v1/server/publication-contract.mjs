function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function required(value, code) {
  const result = text(value);
  if (!result) throw new Error(code);
  return result;
}

function integerInRange(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function serviceProjection(sot) {
  const services = Array.isArray(sot?.services) ? sot.services : [];
  const projected = services
    .map((service) => ({
      service_id: text(service?.service_id),
      name: text(service?.name)
    }))
    .filter((service) => service.service_id && service.name);
  if (!projected.length) throw new Error('CONSULTANT_SERVICES_REQUIRED');
  return projected;
}

function assertSchemas(prepare, discovery) {
  if (prepare?.schema_version !== 'CLARIS_PREMIUM_PREPARE_V3_6') throw new Error('PREPARE_V3_6_REQUIRED');
  if (discovery?.schema_version !== 'CLARIS_DISCOVERY_INTELLIGENCE_V1_2') throw new Error('DISCOVERY_V1_2_REQUIRED');
}

export function compileBriefPublication(input = {}) {
  const consultantId = required(input.consultant_id, 'CONSULTANT_ID_REQUIRED');
  const company = required(input.company, 'COMPANY_REQUIRED');
  const prepare = input.prepare;
  const discovery = input.discovery;
  const consultantSot = input.consultant_sot || {};
  assertSchemas(prepare, discovery);

  return {
    operation: 'brief_create',
    body: {
      consultant_id: consultantId,
      company,
      ttl_days: integerInRange(input.ttl_days, 1, 30, 7),
      brief_payload: { prepare, discovery },
      validation_context: {
        services: serviceProjection(consultantSot),
        commercial_rules: {
          budget_required_before_first_call: consultantSot?.commercial_rules?.budget_required_before_first_call === true
        }
      }
    }
  };
}


export function compileBriefPublishReady(input = {}) {
  const opportunityId = required(input.opportunity_id, 'OPPORTUNITY_ID_REQUIRED');
  const consultantId = required(input.consultant_id, 'CONSULTANT_ID_REQUIRED');
  const company = required(input.company, 'COMPANY_REQUIRED');
  const consultantDeliveryEmail = required(input.consultant_delivery_email, 'CONSULTANT_DELIVERY_EMAIL_REQUIRED');
  const prepare = input.prepare;
  const discovery = input.discovery;
  const consultantSot = input.consultant_sot || {};
  assertSchemas(prepare, discovery);

  return {
    operation: 'brief_publish_ready',
    body: {
      opportunity_id: opportunityId,
      consultant_id: consultantId,
      consultant_delivery_email: consultantDeliveryEmail,
      consultant_first_name: text(input.consultant_first_name) || null,
      company,
      prospect_name: text(input.prospect_name) || null,
      meeting_time: text(input.meeting_time) || null,
      ttl_days: integerInRange(input.ttl_days, 1, 30, 7),
      brief_payload: { prepare, discovery },
      validation_context: {
        services: serviceProjection(consultantSot),
        commercial_rules: {
          budget_required_before_first_call: consultantSot?.commercial_rules?.budget_required_before_first_call === true
        }
      }
    }
  };
}

export function compileBriefReadyNotification(input = {}) {
  const published = input.published || {};
  const prepare = input.prepare;
  const discovery = input.discovery;
  assertSchemas(prepare, discovery);

  const briefUrl = required(published.brief_url, 'PUBLISHED_BRIEF_URL_REQUIRED');
  let parsed;
  try { parsed = new URL(briefUrl); }
  catch { throw new Error('PUBLISHED_BRIEF_URL_INVALID'); }
  if (parsed.protocol !== 'https:') throw new Error('PUBLISHED_BRIEF_URL_INVALID');

  const questions = (Array.isArray(discovery?.primary_questions) ? discovery.primary_questions : [])
    .map((question) => text(question?.ask))
    .filter(Boolean)
    .slice(0, 3);

  return {
    operation: 'CONSULTANT_BRIEF_READY',
    body: {
      opportunity_id: text(input.opportunity_id) || null,
      brief_id: text(published.brief_id) || null,
      consultant_delivery_email: required(input.consultant_delivery_email, 'CONSULTANT_DELIVERY_EMAIL_REQUIRED'),
      consultant_first_name: text(input.consultant_first_name) || null,
      company: required(input.company, 'COMPANY_REQUIRED'),
      prospect_name: text(input.prospect_name) || null,
      meeting_time: text(input.meeting_time) || null,
      executive_readout: required(prepare?.executive_readout, 'EXECUTIVE_READOUT_REQUIRED'),
      priority_questions: questions,
      brief_url: parsed.href,
      expires_at: text(published.expires_at) || null
    }
  };
}
