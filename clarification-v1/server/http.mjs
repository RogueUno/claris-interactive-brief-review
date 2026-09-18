import { bearerToken, cookieValue, json, methodNotAllowed, parseJson } from '../../calibration-v3/server/http.mjs';

export { bearerToken, cookieValue, json, methodNotAllowed, parseJson };

export const CLARIFICATION_SESSION_COOKIE = 'claris_clarification_session';

export function clarificationSessionCookie(token, expiresAt) {
  const expiry = new Date(expiresAt).toUTCString();
  return `${CLARIFICATION_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiry}`;
}
