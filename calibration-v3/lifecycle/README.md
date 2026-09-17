# CLARIS profile lifecycle V1

This layer turns the browser Calibration state into a persisted, governed consultant profile record without changing the certified Make PREPARE / FINALIZE scenario.

## Browser flow

`Calibration local state → snapshot normalizer → consultant_operating_profile_v1 → validator → Runtime V3 compiler → lifecycle record`

The lifecycle record stores both:

- the complete rich operating profile, and
- the narrow Runtime V3 compilation result (`READY` or `BLOCKED`).

Only the deterministic Runtime V3 compiler may produce `consultant_sot_json`.

## Persistence

The GitHub Pages preview uses browser `localStorage` as a demo persistence adapter. This is sufficient to validate lifecycle semantics and return/resume behavior on the same browser, but it is **not** the production identity or persistence backend.

Production must resolve an opaque invite/session token server-side and persist against a stable `consultant_id`; no PII should be placed in the invite URL.

## Browser inspection

The preview exposes:

```js
window.__CLARIS_PROFILE_LIFECYCLE__.record()
window.__CLARIS_PROFILE_LIFECYCLE__.operatingProfile()
window.__CLARIS_PROFILE_LIFECYCLE__.runtimeV3()
window.__CLARIS_PROFILE_LIFECYCLE__.runtimeSot()
```

A non-USD profile remains fully persisted, but Runtime V3 stays `BLOCKED` and emits no `consultant_sot_json` until an explicit deterministic USD normalization policy exists.
