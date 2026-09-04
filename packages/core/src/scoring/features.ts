import type { Candidate } from '../candidates/extract.js';
import type { ParsedSelector } from './selector.js';

/** Normalised Levenshtein similarity in [0, 1]; 1 = identical, 0 = nothing shared. */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  const distance = dp[a.length][b.length];
  return 1 - distance / Math.max(a.length, b.length);
}

/**
 * TRD §5 feature 1: shared data-testid/id tokens, edit distance on values. Compares
 * the broken selector's id/testid against the candidate's, in that priority order
 * (testid is a stronger, more deliberate stability signal than id when both are
 * present — TRD's phrasing lists data-testid first). Returns 0 when neither the
 * selector nor the candidate has anything comparable — this feature has no opinion
 * in that case, it does not penalise.
 */
export function attributeOverlap(selector: ParsedSelector, candidate: Candidate): number {
  if (selector.testId && candidate.attrs['data-testid']) {
    return stringSimilarity(selector.testId, candidate.attrs['data-testid']);
  }
  if (selector.id && candidate.attrs.id) {
    return stringSimilarity(selector.id, candidate.attrs.id);
  }
  return 0;
}
