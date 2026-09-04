import { clone, pickTarget, markTarget, findMarkedFingerprint, stripMarker, bestSelector } from './helpers.js';
import type { MutationResult } from './types.js';

type Tree = unknown[];

/**
 * M6 — duplicate a near-identical element elsewhere (PRD §9, adversarial;
 * repairable but the hard direction — a wrong-but-plausible pick is a false repair).
 *
 * TRD §14's risk row explicitly warns that a *generated* duplicate can be
 * unrealistically easy for a heuristic to reject. This function is the mechanism —
 * it builds a decoy sharing the target's role, tag, and a near-identical accessible
 * name (same words, minor variation) but a different id — deliberately NOT an exact
 * clone, which would be trivially deduped by any uniqueness check. The genuinely
 * hard, hand-authored M6 cases the risk row calls for are added during real corpus
 * construction (Task 32), not invented here; this function only needs to produce a
 * *plausible* decoy for the mutation-engine's own unit tests and for filling out
 * bulk M6 volume where hand-authoring every instance isn't practical.
 */
export function mutateM6(snapshot: unknown, seed: number): MutationResult {
  const mutated = clone(snapshot);
  const target = pickTarget(mutated, seed);
  if (!target) throw new Error('mutateM6: no plausible target element found in this snapshot');

  const t = target as Tree;
  const attrs = t[1] as Record<string, string>;
  // bestSelector falls back to a class selector when no id exists (D-022) — this
  // class's own mutation mechanism (append a decoy) never depended on id anyway.
  const originalSelector = bestSelector(t) ?? `${(t[0] as string).toLowerCase()}`;
  markTarget(t);

  // Build a near-identical decoy: same tag, no id/class collision, a text variant
  // close to the original (so accessible-name similarity stays high without being
  // exact). Decoy identity uses whichever of id/class the target itself has —
  // never fabricates an id on a page idiom that never uses one (D-022).
  const textChild = t.slice(2).find((c) => typeof c === 'string') as string | undefined;
  const decoyText = textChild ? `${textChild} draft` : undefined;
  const decoyAttrs: Record<string, string> = {};
  if (attrs.id) decoyAttrs.id = `${attrs.id}-decoy-${seed}`;
  if (attrs.class) decoyAttrs.class = attrs.class;
  const decoy: Tree = [t[0] as string, decoyAttrs, ...(decoyText ? [decoyText] : [])];

  // Insert the decoy as a sibling of the target's parent's children (same nesting
  // depth, different branch), by wrapping it alongside — appended at the tree root's
  // last position so it's genuinely "elsewhere" rather than adjacent to the target.
  if (Array.isArray(mutated) && typeof mutated[0] === 'string') {
    (mutated as Tree).push(decoy);
  }

  const groundTruthId = findMarkedFingerprint(mutated);
  stripMarker(mutated);

  return { mutated, groundTruthId, class: 'M6', brokenSelector: originalSelector };
}
