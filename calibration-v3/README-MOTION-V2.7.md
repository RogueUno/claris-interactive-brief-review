# CLARIS Calibration V3.1 — reasoning transition layer

This additive layer keeps the existing V3 knowledge model and UI intact while changing only chapter-boundary choreography.

- Chapter bridges close the previous reasoning loop and justify why the next chapter is being investigated.
- Bridge reading time is adaptive to copy length, with a deliberately slower 4.1–5.6 second window.
- The next chapter title stays visually withheld while the bridge is active, then appears after the bridge resolves.
- The earlier short recap overlay is retired by CSS; no Make runtime code is involved.
- The frozen `/calibration-v2/` preview is untouched.
