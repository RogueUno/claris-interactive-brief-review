# CLARIS Calibration V3 — Knowledge Contract

This public preview models the consultant-facing calibration experience only. It does not call Make, does not compile a runtime SoT, and does not alter PREPARE or FINALIZE.

## Safety boundary

Calibration captures a rich consultant operating profile. Downstream runtime use is deliberately narrower:

- `mapped_v3`: concept already has an equivalent in the frozen V3 runtime contract.
- `compile_subset_only`: the rich answer can deterministically affect which already-supported values are emitted, without adding new semantics.
- `mapped_subset_v3`: only exact supported values may map; extra nuance remains profile-only.
- `conditional`: mapping is allowed only when a deterministic compatibility rule exists.
- `profile_only`: persist and display now; do not inject into the frozen runtime.

No profile-only field should be appended to `consultant_sot_json` merely because Gemini could read it.

## Consultant-owned calibration fields

| Chapter | Field | Critical | Research use | Runtime status |
| --- | --- | --- | --- | --- |
| Practice | Services | Yes | Prefill, then confirm | mapped_v3 |
| Practice | Service state | Yes | None | compile_subset_only |
| Practice | Lead service preference | No | None | profile_only |
| Practice | Paused-service handling | No | None | profile_only |
| Opportunity | Company types | Yes | Prefill, then confirm | mapped_v3 |
| Opportunity | Buyer/stakeholder roles | No | Prefill, then confirm | profile_only |
| Opportunity | Company stage | No | Prefill, then confirm | profile_only |
| Opportunity | Geography relevance/preferences | No | Ask only when material | profile_only |
| Commercial | Minimum engagement | Yes | None | conditional |
| Commercial | Currency | Yes | None | conditional |
| Commercial | Engagement models | No | Prefill, then confirm | profile_only |
| Commercial | Budget before call | Yes | None | mapped_v3 |
| Commercial | Hard disqualifiers | Yes (explicit none allowed) | None | profile_only |
| Commercial | Caution signals | No | None | profile_only |
| Judgment | First-call requirements | Yes | None | mapped_subset_v3 |
| Judgment | Positive buying/context signals | No | None | profile_only |
| Judgment | Vanity signals not sufficient alone | No | None | profile_only |
| Strategy | Discovery style | No | None | profile_only |
| Strategy | Brief density | No | None | profile_only |
| Strategy | Preferred next move | No | None | profile_only |
| Strategy | Proof to surface | No | None | profile_only |
| Strategy | Avoid pushing prematurely | No | None | profile_only |
| Exceptions | Non-standard opportunities worth a closer look | No | None | profile_only |

## System-owned rules

The consultant calibration must not expose controls that redefine factual provenance, unknown handling, score-eligible evidence authorities, non-observation rules, or deterministic scoring weights. Those remain CLARIS-owned governance.

## Requiredness

Critical before profile lock:
- at least one active/selective service
- at least one operating company type
- minimum engagement amount with original currency preserved
- explicit hard-disqualifier confirmation, including an explicit none
- at least one first-call qualification rule
- geography selection only when the consultant says geography materially matters

Everything else may remain open without inventing an answer.

## Research behavior

Public research may:
- prefill likely values
- suppress a redundant question when a consultant has already confirmed the same fact elsewhere
- change copy from discover to confirm/contrast
- surface a conflict for clarification

Public research may not silently become consultant operating truth.

## Runtime compatibility

The preview intentionally contains no runtime adapter. A later deterministic compiler should emit only fields already certified in the frozen runtime contract and preserve every unmapped field in the rich operating profile without sending it to PREPARE or FINALIZE.
