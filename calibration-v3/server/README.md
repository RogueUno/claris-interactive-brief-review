# CLARIS server identity + persistence V1

This is the production-facing boundary for Calibration. It does **not** call Make and does not modify PREPARE / FINALIZE.

## Flow

1. Admin creates an invite with `POST /api/calibration/admin/invite`.
2. Server returns one opaque token. The stored invite contains only its SHA-256 hash.
3. Consultant opens `...#invite=<opaque token>`; the fragment is not sent in the initial HTTP request.
4. UI reads the fragment, clears it from the address bar, then exchanges the token at `POST /api/calibration/resolve`.
5. Server resolves the canonical consultant identity and issues an HttpOnly signed session cookie.
6. `GET/PUT /api/calibration/profile` loads or saves resumable Calibration state.
7. `POST /api/calibration/lock` sets the lock timestamp server-side, rebuilds the governed operating profile, and stores the Runtime V3 compilation result alongside it.

The browser never chooses the canonical consultant identity and never produces `consultant_sot_json`. The server rebinds identity and calls the existing deterministic lifecycle compiler.

## Persistence

The production adapter uses a **private Vercel Blob store**. Paths are deterministic:

- `claris/invites/<sha256-token>.json`
- `claris/consultants/<consultant_id>/identity.json`
- `claris/consultants/<consultant_id>/profile.json`

Invite URLs contain no name, email, firm, or consultant ID.

## Required environment variables

- `BLOB_READ_WRITE_TOKEN`
- `CLARIS_SESSION_SECRET` (minimum 32 characters)
- `CLARIS_ADMIN_KEY`
- `CLARIS_CALIBRATION_BASE_URL`

## Safety properties

- raw invite tokens are never persisted;
- expired/revoked invites fail closed;
- session tokens are HMAC-signed and expire;
- client-submitted identity is overwritten with server identity;
- a locked profile cannot be silently edited;
- runtime SoT stays server-side;
- non-USD profiles may lock, but Runtime V3 remains BLOCKED until a deterministic currency policy is certified;
- no Make endpoint is referenced anywhere in this layer.

## Test

`npm run test:server`
