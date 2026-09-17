export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export async function parseJson(request) {
  try { return { ok: true, value: await request.json() }; }
  catch { return { ok: false, response: json({ ok: false, error: 'INVALID_JSON' }, 400) }; }
}

export function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export function cookieValue(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const item of raw.split(';')) {
    const [key, ...rest] = item.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function sessionCookie(token, expiresAt) {
  const expiry = new Date(expiresAt).toUTCString();
  return `claris_cal_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiry}`;
}

export function methodNotAllowed(allow) {
  return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: allow });
}
