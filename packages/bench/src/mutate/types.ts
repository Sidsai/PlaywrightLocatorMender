export type MutationClass = 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7' | 'M8';

export interface MutationResult {
  mutated: unknown; // [tag, attrs, ...children] tree, same shape as the original
  /** The fingerprint (packages/core/candidates/fingerprint.ts) of the element the
   *  mutation targeted, IN THE MUTATED TREE — this is what a correct repair proposal
   *  must resolve to. null only for M7 (deletion): there is no correct target. */
  groundTruthId: string | null;
  class: MutationClass;
  brokenSelector: string; // the selector that would now fail to find the target
}

// Internal-only marker attribute used to track the mutation target through
// structural changes. Deliberately not one of extract.ts's STABLE_ATTR_KEYS, and
// not shaped like an aria- or data-testid attribute, so it never leaks into a real
// Candidate's attrs — ground truth is computed by a raw tree walk in this package,
// not by asking extractCandidates to see the marker.
export const TARGET_MARKER = 'data-mender-bench-target';
