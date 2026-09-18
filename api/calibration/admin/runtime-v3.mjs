import { serverContext } from '../../../calibration-v3/server/api-shared.mjs';
import { buildRuntimeV3Export } from '../../../calibration-v3/server/runtime-export.mjs';
import { bearerToken, json, methodNotAllowed } from '../../../calibration-v3/server/http.mjs';

export default {
  async fetch(request) {
    if (request.method !== 'GET') return methodNotAllowed('GET');

    const adminKey = process.env.CLARIS_ADMIN_KEY || '';
    if (!adminKey || bearerToken(request) !== adminKey) {
      return json({ ok: false, error: 'ADMIN_UNAUTHORIZED' }, 401);
    }

    const url = new URL(request.url);
    const consultantId = String(url.searchParams.get('consultant_id') || '').trim();
    if (!consultantId) {
      return json({ ok: false, error: 'CONSULTANT_ID_REQUIRED' }, 400);
    }

    try {
      const { envelope, etag } = await serverContext().repository.loadProfileEnvelopeWithMeta(consultantId);
      const result = buildRuntimeV3Export(envelope, etag);
      const { http_status: status, ...body } = result;
      return json(body, status);
    } catch (error) {
      const code = error?.message === 'INVALID_CONSULTANT_ID'
        ? 'INVALID_CONSULTANT_ID'
        : 'RUNTIME_V3_EXPORT_FAILED';
      return json({ ok: false, error: code }, code === 'INVALID_CONSULTANT_ID' ? 400 : 500);
    }
  }
};
