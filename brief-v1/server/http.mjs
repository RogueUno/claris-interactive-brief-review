export { bearerToken, cookieValue, json, methodNotAllowed, parseJson } from '../../calibration-v3/server/http.mjs';

export function briefSessionCookie(token, expiresAt) {
  const expiry = new Date(expiresAt).toUTCString();
  return `claris_brief_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${expiry}`;
}
