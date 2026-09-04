import { clone, pickTarget, markTarget, findMarkedFingerprint, stripMarker, collectElements } from './helpers.js';
import type { MutationResult } from './types.js';

type Tree = unknown[];

/**
 * M8 — make the selector match two elements / strict-mode violation (PRD §9,
 * repairable). Picks a target, ensures it has a class token, then applies that same
 * token to a second, different element — so a class selector that used to resolve
 * to exactly one element now resolves to at least two. Ground truth is the
 * originally-intended element (the one the selector was written for), not the
 * second element that now also matches — TRD §6 notes the reranker prompt for this
 * class asks "which of the matched elements was intended", not "find a
 * replacement", but groundTruthId still names that intended element for scoring.
 */
export function mutateM8(snapshot: unknown, seed: number): MutationResult {
  const mutated = clone(snapshot);
  const target = pickTarget(mutated, seed);
  if (!target) throw new Error('mutateM8: no plausible target element found in this snapshot');

  const t = target as Tree;
  const attrs = t[1] as Record<string, string>;
  markTarget(t);

  const sharedClass = attrs.class?.split(' ')[0] ?? `mender-bench-shared-${seed}`;
  attrs.class = sharedClass;

  const others = collectElements(mutated).filter((el) => el !== t);
  const second = others[Math.floor(seededRandomIndex(seed, others.length))];
  if (second) {
    const secondAttrs = second[1] as Record<string, string>;
    secondAttrs.class = secondAttrs.class ? `${secondAttrs.class} ${sharedClass}` : sharedClass;
  }

  const groundTruthId = findMarkedFingerprint(mutated);
  stripMarker(mutated);

  return { mutated, groundTruthId, class: 'M8', brokenSelector: `.${sharedClass}` };
}

function seededRandomIndex(seed: number, length: number): number {
  if (length === 0) return 0;
  // Simple deterministic spread — doesn't need to match helpers' PRNG exactly,
  // just needs to be stable for a given seed.
  return ((seed * 2654435761) >>> 0) % length;
}
