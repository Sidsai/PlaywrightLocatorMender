import { parseSelector } from './selector.js';
import { attributeOverlap, roleMatch, textSimilarity, structuralProximity, uniquenessPenalty } from './features.js';
import type { Candidate } from '../candidates/extract.js';

export interface ScoredCandidate {
  candidate: Candidate;
  score: number;
}

// Equal weighting across TRD §5's five features — the TRD does not prescribe
// relative weights, and equal weighting is the honest default until the corpus
// (M2) produces data to tune against (that tuning is Task 39's job, via the
// margin/confidence thresholds — this file's weights stay fixed at 0.2 each
// deliberately, so Task 39 tunes THRESHOLDS against a fixed scorer, not both at
// once, which would make the sweep's results impossible to interpret).
const WEIGHT = 0.2;

/**
 * Scores every candidate against the broken selector using TRD §5's five
 * heuristic features, returns the top 10 sorted descending by score. This is the
 * entire offline-mode path (TRD §5, PRD §4 P4): no model, no network.
 */
export function scoreCandidates(brokenSelector: string, candidates: Candidate[]): ScoredCandidate[] {
  const selector = parseSelector(brokenSelector);

  const scored: ScoredCandidate[] = candidates.map((candidate) => {
    const score =
      WEIGHT * attributeOverlap(selector, candidate) +
      WEIGHT * roleMatch(selector, candidate) +
      WEIGHT * textSimilarity(selector, candidate) +
      WEIGHT * structuralProximity(selector, candidate) +
      WEIGHT * uniquenessPenalty(candidate, candidates);
    return { candidate, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10);
}
