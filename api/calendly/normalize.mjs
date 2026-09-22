import { normalizeCalendlyBooking } from '../../calibration-v3/server/calendly-booking-normalizer.mjs';
import { json, methodNotAllowed, parseJson } from '../../calibration-v3/server/http.mjs';

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

    const result = normalizeCalendlyBooking({
      consultant_id: parsed.value?.consultant_id,
      event: parsed.value?.event,
      invitee: parsed.value?.invitee
    });

    return json(result, result.ok ? 200 : 422);
  }
};
