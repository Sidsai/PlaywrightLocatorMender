import { clone, pickTarget, markTarget, findMarkedFingerprint, stripMarker, seededRandom } from './helpers.js';
import type { MutationResult } from './types.js';

type Tree = unknown[];

/** M4 — reorder siblings (PRD §9, repairable). Breaks any selector that depends on
 *  positional (nth-child/nth-of-type) structure while leaving the target's own
 *  attributes untouched — an id/data-testid selector survives; a structural one
 *  doesn't, which is exactly what this mutation class exercises. */
export function mutateM4(snapshot: unknown, seed: number): MutationResult {
  const mutated = clone(snapshot);
  const target = pickTarget(mutated, seed);
  if (!target) throw new Error('mutateM4: no plausible target element found in this snapshot');
  markTarget(target);

  const rand = seededRandom(seed + 2000);
  let originalSelector = '';

  (function reorderParent(node: unknown): boolean {
    if (!Array.isArray(node) || typeof node[0] !== 'string') return false;
    const elementIndices = node
      .map((c, i) => ({ c, i }))
      .filter(({ i, c }) => i >= 2 && Array.isArray(c));
    if (elementIndices.some(({ c }) => c === target) && elementIndices.length > 1) {
      const parentTag = node[0] as string;
      const sameTagSiblings = elementIndices.filter(({ c }) => (c as Tree)[0] === target[0]);
      const nthOfType = sameTagSiblings.findIndex(({ c }) => c === target) + 1;
      originalSelector = `${parentTag.toLowerCase()} > ${(target[0] as string).toLowerCase()}:nth-of-type(${nthOfType})`;

      // Fisher-Yates shuffle of the element children, seeded for reproducibility.
      const elements = elementIndices.map(({ c }) => c);
      for (let i = elements.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [elements[i], elements[j]] = [elements[j], elements[i]];
      }
      elementIndices.forEach(({ i }, k) => {
        node[i] = elements[k];
      });
      return true;
    }
    for (let i = 2; i < node.length; i++) {
      if (reorderParent(node[i])) return true;
    }
    return false;
  })(mutated);

  const groundTruthId = findMarkedFingerprint(mutated);
  stripMarker(mutated);

  return { mutated, groundTruthId, class: 'M4', brokenSelector: originalSelector };
}
