import type { ScoredCandidate } from './heuristic.js';

/**
 * top1 - top2. This is the runtime M6 detector (TRD §5): an M6 case (near-identical
 * duplicate elsewhere) collapses the margin between the top two candidates even
 * when the top score itself looks healthy, because the decoy scores almost as well
 * as the real target. An absolute-score threshold alone cannot see this; margin is
 * the signal that can.
 *
 * A single remaining candidate has no "second place" to be ambiguous against, so
 * margin is maximal (1) in that case — margin measures AMBIGUITY specifically, not
 * the candidate's absolute quality (that is confidence's job, kept separate per
 * TRD §11's two-gate design). Zero candidates is likewise unambiguous-by-vacuity.
 */
export function margin(scored: ScoredCandidate[]): number {
  if (scored.length <= 1) return 1;
  return scored[0].score - scored[1].score;
}
