# Brief V5 Inter typography comparison — 2026-10-04

## Source and scope
- User-supplied archive: `Inter-4.1.zip`; inspected its internal `web/InterVariable.woff2` and variable TTF.
- Embedded version string: `Version 4.001;git-9221beed3`; variable axes: optical size `opsz` 14–32, weight `wght` 100–900.
- Compared the **attached font** rendered with three OpenType configurations at the existing V5 type sizes/weights, using V5-derived lead identity, booking, call time, scores, and Snapshot samples. This was a local font specimen, **not** a browser capture of the private Vercel page or a checksum verification of the remotely served stylesheet.

## OpenType facts (from attached font metadata)
- `cv01`: **Alternate one** (the straighter, Helvetica-like numeral 1).
- `ss07`: Square punctuation.
- `ss08`: Square quotes.
- `cv10`: Capital G with spur.

## Configurations compared
- A — V5 existing CSS feature set: `liga`, `calt`, `ss07`, `ss08`, `cv10`, `cv01`.
- B — Attached font with `liga`, `calt`, `cv01` only.
- C — Attached font with `liga`, `calt` only (default numeral 1).

## Findings
- **A vs B:** the numeral `1` renders identically; differences are confined to other supported characters (punctuation/quotes and G where present). A preserves the punctuation treatment already selected for CLARIS.
- **B vs C:** `1` changes shape under `cv01`, including in `10:30`, `2018`, `201–500`, and `Q1`.
- Current `brief-v5/styles.css` **already explicitly sets `cv01` to 1**, alongside `ss07`, `ss08`, and `cv10` in both the semantic and final typography blocks.
- The stylesheet currently imports `https://rsms.me/inter/inter.css`. Actual remote font version/load success was **not** verified, so this study should not be presented as proof that every protected V5 browser session received this exact attachment.

## Decision
**Keep A's existing feature switches.** Switching to B does not improve numeral 1 because V5 already enables it, and drops CLARIS's selected square punctuation/quotes and G treatment. Do not change V5 globally just for `cv01`.

If a live browser still displays the default `1`, inspect actual computed font-family, loaded face/version, and CSP/network font response on the protected V5 URL. A missing/blocked font file or inherited style override should be fixed at the loading/cascade level, not by stacking more identical `cv01` declarations.

No font binary was added to the repository. PREPARE, FINALIZE, Make and certified publication remain untouched.
