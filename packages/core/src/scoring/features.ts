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

const TAG_TO_ROLE: Record<string, string> = {
  BUTTON: 'button',
  A: 'link',
  INPUT: 'textbox',
};

/**
 * TRD §5 feature 2: role inferred from the broken selector vs candidate role.
 * A selector like "button.row-action" implies role "button" via its tag; an
 * id-only selector like "#save-btn" implies nothing about role at all. Returning
 * 0 for the no-signal case would make this feature actively penalise every
 * candidate on an id-based selector, which is wrong — 0.5 (neutral/uncertain)
 * keeps the feature honest about what it does and doesn't know.
 */
export function roleMatch(selector: ParsedSelector, candidate: Candidate): number {
  if (!selector.tag) return 0.5;
  const impliedRole = TAG_TO_ROLE[selector.tag] ?? selector.tag.toLowerCase();
  return impliedRole === candidate.role ? 1 : 0;
}

function normalise(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * TRD §5 feature 3: normalised similarity between selector-implied text and the
 * candidate's accessible name. Only Playwright's text engine (text="...") carries
 * an explicit text signal in the broken selector itself; an id/class selector has
 * none, so this returns 0 (a genuine absence of signal, unlike roleMatch's 0.5 —
 * text similarity has no tag-shaped "partial" signal to fall back to).
 */
export function textSimilarity(selector: ParsedSelector, candidate: Candidate): number {
  if (!selector.text || !candidate.accessibleName) return 0;
  return stringSimilarity(normalise(selector.text), normalise(candidate.accessibleName));
}

/**
 * TRD §5 feature 4: "DOM distance from the nearest ancestor that still resolves."
 * Since the broken selector no longer resolves to any live node, its exact former
 * tree position is unknown — this approximates distance via tree DEPTH: how many
 * ancestor levels the selector's own segment count implies, versus the candidate's
 * fingerprint depth (segments separated by ">"). Two elements at similar depth in
 * a similarly-structured page are more likely to be the same one than two at very
 * different depths — an approximation, not exact ancestor-chain matching, and
 * TRD's phrasing is honoured in spirit rather than literally implementable without
 * the original (mutated-away) tree position.
 */
export function structuralProximity(selector: ParsedSelector, candidate: Candidate): number {
  const candidateDepth = candidate.fingerprint.split('>').length;
  const diff = Math.abs(selector.depth - candidateDepth);
  return 1 / (1 + diff);
}
