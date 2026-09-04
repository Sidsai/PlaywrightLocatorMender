import { clone, pickTarget, markTarget, findMarkedFingerprint, stripMarker } from './helpers.js';
import type { MutationResult } from './types.js';

type Tree = unknown[];

/** M3 — wrap the target in extra elements (PRD §9, repairable). Replaces the
 *  target in its parent's children with a wrapper DIV containing the target. */
export function mutateM3(snapshot: unknown, seed: number): MutationResult {
  const mutated = clone(snapshot);
  const target = pickTarget(mutated, seed);
  if (!target) throw new Error('mutateM3: no plausible target element found in this snapshot');

  markTarget(target);

  // An id-based selector survives wrapping in real DOM semantics — wrapping only
  // displaces structural position, so the broken selector must be structural
  // (parent-tag > child-tag:nth-of-type(n)) for this mutation to be meaningful.
  let originalSelector = '';

  // Find target's parent (by reference) and splice in a wrapper.
  (function wrapInParent(node: unknown): boolean {
    if (!Array.isArray(node) || typeof node[0] !== 'string') return false;
    const parentTag = node[0] as string;
    let nthOfType = 0;
    for (let i = 2; i < node.length; i++) {
      if (Array.isArray(node[i]) && (node[i] as Tree)[0] === target[0]) nthOfType++;
      if (node[i] === target) {
        originalSelector = `${parentTag.toLowerCase()} > ${(target[0] as string).toLowerCase()}:nth-of-type(${nthOfType})`;
        const wrapper: Tree = ['DIV', { class: 'mender-bench-wrapper' }, target];
        node[i] = wrapper;
        return true;
      }
      if (wrapInParent(node[i])) return true;
    }
    return false;
  })(mutated);

  const groundTruthId = findMarkedFingerprint(mutated);
  stripMarker(mutated);

  return { mutated, groundTruthId, class: 'M3', brokenSelector: originalSelector };
}
