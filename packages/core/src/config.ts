/**
 * Shipped defaults for the two-gate decision (TRD §11, D-004). Both are
 * re-derived from real corpus data rather than chosen by hand.
 *
 * marginThreshold (delta): derived by packages/bench/src/score/sweep.ts's
 * sweepDelta()/selectOperatingPoint() against the real committed corpus
 * (packages/bench/corpus/, 360 cases as of this run) — the largest-coverage delta
 * whose false-repair rate (Wilson 95% upper bound) still clears the PRD §8 3% bar.
 * Current measured value: delta=0.06, at which the heuristic-only scorer achieves
 * repair rate 18.2%, false-repair rate (Wilson upper) 1.06%, on the six-idiom
 * project-owned-fixture corpus (see packages/bench/RESULTS-heuristics.md).
 *
 * This REPLACES the pre-corpus placeholder default of 0.15 documented in
 * mender-trd.md §11's example config — that value was an engineering guess made
 * before any corpus existed to derive one from (TRD §11 says as much explicitly).
 * confidenceThreshold (tau) stays at the pre-corpus default of 0.85 — it only
 * applies once a reranker's calibrated confidence exists (M4), which does not yet
 * exist at M3. Re-derive tau alongside its own tier's sweep in M4.
 */
export const CONFIG_DEFAULTS = {
  marginThreshold: 0.06,
  confidenceThreshold: 0.85, // pre-corpus default; M4 re-derives per provider tier
};
