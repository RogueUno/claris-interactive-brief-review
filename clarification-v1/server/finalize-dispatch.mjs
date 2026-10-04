// Private dispatch observability. This record does NOT assert successful
// Gemini finalization or Gmail delivery, only an accepted webhook request.
export const FINALIZE_DISPATCH_VERSION = 'claris_finalize_dispatch_v1';

export function pendingFinalizeDispatch(submittedAt) {
  return {
    schema_version: FINALIZE_DISPATCH_VERSION,
    status: 'PENDING',
    submitted_at: submittedAt,
    checked_at: null,
    failure_code: null,
    http_status: null
  };
}

export async function recordFinalizeDispatch(repository, opportunityId, result, {
  now = Date.now()
} = {}) {
  if (!repository?.loadEnvelopeWithMeta || !repository?.saveEnvelopeWithMeta) {
    throw new Error('FINALIZE_DISPATCH_REPOSITORY_REQUIRED');
  }
  const id = String(opportunityId || '').trim();
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(id)) {
    return { ok: false, error: 'OPPORTUNITY_ID_INVALID' };
  }
  const loaded = await repository.loadEnvelopeWithMeta(id);
  const envelope = loaded?.envelope;
  const current = envelope?.finalize_dispatch;
  if (!envelope || !loaded.etag || current?.schema_version !== FINALIZE_DISPATCH_VERSION) {
    return { ok: false, error: 'FINALIZE_DISPATCH_PENDING_RECORD_MISSING' };
  }
  if (current.status !== 'PENDING') {
    return {
      ok: true, reused: true,
      status: current.status
    };
  }

  const successful = result?.ok === true;
  const status = successful ? 'DISPATCH_ACCEPTED' : 'RECONCILIATION_REQUIRED';
  const knownErrors = new Set([
    'FINALIZE_WEBHOOK_NOT_CONFIGURED',
    'FINALIZE_WEBHOOK_REJECTED',
    'FINALIZE_WEBHOOK_FAILED',
    'FINALIZE_FETCH_UNAVAILABLE',
    'OPPORTUNITY_ID_REQUIRED'
  ]);
  const failureCode = successful ? null
    : (knownErrors.has(result?.error) ? result.error : 'FINALIZE_DISPATCH_UNKNOWN_ERROR');
  const httpStatus = Number.isInteger(result?.status) &&
    result.status >= 100 && result.status <= 599 ? result.status : null;
  const updated = {
    ...envelope,
    finalize_dispatch: {
      ...current,
      status,
      checked_at: new Date(now).toISOString(),
      failure_code: failureCode,
      http_status: successful ? null : httpStatus
    }
  };
  try {
    await repository.saveEnvelopeWithMeta(id, updated, { ifMatch: loaded.etag });
  } catch (error) {
    if (error?.code === 'BLOB_PRECONDITION_FAILED' ||
        error?.message === 'BLOB_PRECONDITION_FAILED') {
      return { ok: false, error: 'FINALIZE_DISPATCH_WRITE_CONFLICT' };
    }
    throw error;
  }
  return { ok: true, status, reused: false };
}
