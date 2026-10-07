import { normalizeCalendlyBooking } from '../../calibration-v3/server/calendly-booking-normalizer.mjs';
import { json, methodNotAllowed, parseJson } from '../../calibration-v3/server/http.mjs';

let trustedIngestPromise = null;

export function trustedBookingFactsEnabled(env = process.env) {
  const value = String(env?.CLARIS_TRUSTED_BOOKING_FACTS_V1 || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'enabled';
}

export function trustedBookingFactHttpStatus(result) {
  if (result?.ok) return 200;
  const error = String(result?.error || '');
  if (error === 'BOOKING_FACT_IMMUTABLE_CONFLICT') return 409;
  if (['PROFILE_NOT_LOCKED', 'RUNTIME_V3_NOT_READY'].includes(error)) return 409;
  if (
    error === 'PROFILE_READ_FAILED' ||
    error === 'BOOKING_FACT_CREATE_UNCERTAIN' ||
    error === 'TRUSTED_BOOKING_FACT_PERSIST_FAILED' ||
    error === 'TRUSTED_BOOKING_FACT_COMPILE_FAILED' ||
    error === 'TRUSTED_BOOKING_FACT_SERVER_UNAVAILABLE'
  ) return 503;
  return 422;
}

async function loadTrustedIngest() {
  if (trustedIngestPromise) return trustedIngestPromise;
  trustedIngestPromise = (async () => {
    const [
      { serverContext },
      { createTrustedBookingFactService },
      { compileTrustedCalendlyBookingFacts, evaluateTrustedBookingQualification },
      { createBookingFactRepository },
      { createTrustedCalendlyIngest }
    ] = await Promise.all([
      import('../../calibration-v3/server/api-shared.mjs'),
      import('../../calibration-v3/server/trusted-booking-fact-service.mjs'),
      import('../../calibration-v3/server/trusted-booking-facts.mjs'),
      import('../../calibration-v3/server/booking-fact-repository.mjs'),
      import('../../calibration-v3/server/trusted-calendly-ingest.mjs')
    ]);

    const { storage, repository } = serverContext();
    const bookingFactService = createTrustedBookingFactService({
      loadProfileEnvelope: (consultantId) => repository.loadProfileEnvelope(consultantId),
      compileFacts: compileTrustedCalendlyBookingFacts,
      evaluateQualification: evaluateTrustedBookingQualification
    });
    const bookingFactRepository = createBookingFactRepository(storage);

    return createTrustedCalendlyIngest({
      normalizeBooking: normalizeCalendlyBooking,
      bookingFactService,
      bookingFactRepository
    });
  })();
  return trustedIngestPromise;
}

function authorized(request) {
  const accepted = [process.env.CLARIS_MAKE_KEY, process.env.CLARIS_ADMIN_KEY]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  if (!accepted.length) return false;

  const authorization = String(request.headers.get('authorization') || '').trim();
  const candidates = new Set([authorization]);
  const finalToken = authorization.split(/\s+/).filter(Boolean).at(-1);
  if (finalToken) candidates.add(finalToken);

  let stripped = authorization;
  for (let index = 0; index < 2; index += 1) {
    if (!/^Bearer\s+/i.test(stripped)) break;
    stripped = stripped.replace(/^Bearer\s+/i, '').trim();
    candidates.add(stripped);
  }
  const wrapped = stripped.match(/^<(.+)>$/s);
  if (wrapped?.[1]) candidates.add(wrapped[1].trim());

  return accepted.some((key) => candidates.has(key));
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    if (!authorized(request)) return json({ ok: false, error: 'MAKE_UNAUTHORIZED' }, 401);

    const parsed = await parseJson(request);
    if (!parsed.ok) return parsed.response;

    const input = {
      consultant_id: parsed.value?.consultant_id,
      require_company_website_answer: parsed.value?.require_company_website_answer === true,
      event: parsed.value?.event,
      invitee: parsed.value?.invitee
    };

    let result;
    if (trustedBookingFactsEnabled()) {
      try {
        const trustedIngest = await loadTrustedIngest();
        result = await trustedIngest.ingest(input);
      } catch {
        result = { ok: false, error: 'TRUSTED_BOOKING_FACT_SERVER_UNAVAILABLE' };
      }
    } else {
      result = normalizeCalendlyBooking(input);
    }

    return json(result, trustedBookingFactHttpStatus(result));
  }
};
