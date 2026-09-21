export async function triggerFinalizeContinuation(
  opportunityId,
  {
    webhookUrl = process.env.CLARIS_FINALIZE_WEBHOOK_URL,
    fetchImpl = globalThis.fetch
  } = {}
) {
  const canonicalOpportunityId = String(opportunityId || '').trim();
  if (!canonicalOpportunityId) {
    return { ok: false, error: 'OPPORTUNITY_ID_REQUIRED' };
  }

  const url = String(webhookUrl || '').trim();
  if (!url) {
    return { ok: false, error: 'FINALIZE_WEBHOOK_NOT_CONFIGURED' };
  }
  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'FINALIZE_FETCH_UNAVAILABLE' };
  }

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ opportunity_id: canonicalOpportunityId })
    });

    if (!response?.ok) {
      return {
        ok: false,
        error: 'FINALIZE_WEBHOOK_REJECTED',
        status: Number.isFinite(response?.status) ? response.status : null
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: 'FINALIZE_WEBHOOK_FAILED' };
  }
}
