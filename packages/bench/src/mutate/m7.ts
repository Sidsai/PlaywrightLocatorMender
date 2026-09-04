import { clone, pickTarget, bestSelector } from './helpers.js';
import type { MutationResult } from './types.js';

type Tree = unknown[];

/**
 * M7 — delete the element (PRD §9, NOT repairable). Tests abstention (PRD §8
 * "abstention accuracy"): groundTruthId is deliberately null, since there is no
 * correct repair — the element is gone. No marker/fingerprint tracking is needed
 * here, unlike every other mutation class, because there is nothing to track.
 */
export function mutateM7(snapshot: unknown, seed: number): MutationResult {
  const mutated = clone(snapshot);
  const target = pickTarget(mutated, seed);
  if (!target) throw new Error('mutateM7: no plausible target element found in this snapshot');

  // bestSelector falls back to a class selector when no id exists (D-022) —
  // deletion never depended on id as a mutation mechanism anyway.
  const originalSelector = bestSelector(target) ?? `${(target[0] as string).toLowerCase()}`;

  (function removeFromParent(node: unknown): boolean {
    if (!Array.isArray(node) || typeof node[0] !== 'string') return false;
    for (let i = 2; i < node.length; i++) {
      if (node[i] === target) {
        (node as Tree).splice(i, 1);
        return true;
      }
      if (removeFromParent(node[i])) return true;
    }
    return false;
  })(mutated);

  return { mutated, groundTruthId: null, class: 'M7', brokenSelector: originalSelector };
}
