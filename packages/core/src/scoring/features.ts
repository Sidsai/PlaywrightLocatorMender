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
 * Similarity tuned for identifier values (id/data-testid), not general text.
 * Plain normalised edit distance treats an appended suffix as damage proportional
 * to the WHOLE string's length, which badly under-scores the single most common
 * real-world id-drift pattern: a build tool or framework appends a hash/counter
 * suffix to an otherwise-unchanged id (`save-btn` -> `save-btn-a1b2c3`,
 * `save-btn-renamed-5`, ...). Found via Task 39's real-corpus sweep: an id
 * (`cancel-btn`) that merely happened to share a generic "-btn" suffix with the
 * broken selector's id (`save-btn`) scored HIGHER via plain edit distance than the
 * actual renamed target (`save-btn-renamed-5`), because Levenshtein normalises by
 * the longer string's full length and doesn't recognise "one string is a prefix of
 * the other" as the strong signal it is. This produced a genuine 0% repair rate for
 * mutation class M1 — see AI/DECISION.md D-023.
 *
 * Prefix/suffix containment is checked FIRST and, when present, dominates: scored
 * by how much of the longer string the shared prefix/suffix covers, which
 * correctly favours "save-btn-renamed-5" (prefix covers 8/19 chars, but is an
 * unbroken structural prefix) over a same-length coincidental suffix match on an
 * unrelated word. Falls back to plain edit-distance similarity when neither string
 * contains the other.
 */
function identifierSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  if (a.startsWith(b) || b.startsWith(a) || a.endsWith(b) || b.endsWith(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    // Scaled into [0.5, 1.0] rather than a flat floor — a flat floor (tried first)
    // can exactly TIE a coincidental non-containment match at the same numeric
    // value (found in testing: both landed on 0.6), which fails to break the tie
    // in containment's favour at all. This formula guarantees containment always
    // scores strictly higher than the 0.5 baseline, scaling up with how much of
    // the longer string the shared prefix/suffix actually covers.
    return 0.5 + 0.5 * (shorter / longer);
  }
  return stringSimilarity(a, b);
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
    return identifierSimilarity(selector.testId, candidate.attrs['data-testid']);
  }
  if (selector.id && candidate.attrs.id) {
    return identifierSimilarity(selector.id, candidate.attrs.id);
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

const TWIN_SIMILARITY_THRESHOLD = 0.5;

/**
 * Word-overlap (Jaccard) similarity — O(words), no DP table allocation, unlike
 * stringSimilarity's O(len_a * len_b) Levenshtein. Used specifically for twin
 * detection (below), which calls this O(n) times per candidate scored, making it
 * O(n²) overall (TRD §13 found this exceeding the 100ms budget with full
 * Levenshtein at n=40 — 121ms measured; see AI/DECISION.md D-024). Word overlap is
 * also arguably the more correct model for "does this read as the same button" —
 * "Save changes" vs "Save changes draft" share 2 of 3 words, which is a more
 * legible near-duplicate signal than character-level edit distance for this
 * specific purpose (M6 decoys are built by appending/varying whole words, not
 * scrambling characters — see mutateM6).
 */
function wordOverlapSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' ').filter(Boolean));
  const wordsB = new Set(b.split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * TRD §5 feature 5: penalty where the candidate is one of several near-identical
 * siblings. This is the direct defense against M6 (PRD §9's adversarial mutation
 * class, a near-identical duplicate elsewhere) — a candidate sharing its role and a
 * closely similar accessible name with one or more other candidates is exactly the
 * shape of an ambiguous, easy-to-mispick case. Returns 1 (no penalty) when the
 * candidate has no such twins; approaches 0 as more twins accumulate.
 */
export function uniquenessPenalty(candidate: Candidate, allCandidates: Candidate[]): number {
  if (!candidate.accessibleName) return 1;
  const candidateName = normalise(candidate.accessibleName);
  let twinCount = 0;
  for (const other of allCandidates) {
    if (other === candidate) continue;
    if (other.role !== candidate.role) continue;
    if (!other.accessibleName) continue;
    if (wordOverlapSimilarity(candidateName, normalise(other.accessibleName)) >= TWIN_SIMILARITY_THRESHOLD) twinCount++;
  }
  return 1 / (1 + twinCount);
}
