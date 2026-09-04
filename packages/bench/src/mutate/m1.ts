import { clone, pickTarget, markTarget, findMarkedFingerprint, stripMarker } from './helpers.js';
import type { MutationResult } from './types.js';

/** M1 — rename `data-testid` or `id` (PRD §9, repairable). */
export function mutateM1(snapshot: unknown, seed: number): MutationResult {
  const mutated = clone(snapshot);
  const target = pickTarget(mutated, seed);
  if (!target) throw new Error('mutateM1: no element with an id attribute found in this snapshot');

  const attrs = target[1] as Record<string, string>;
  const oldId = attrs.id;
  markTarget(target);
  attrs.id = `${oldId}-renamed-${seed}`;

  const groundTruthId = findMarkedFingerprint(mutated);
  stripMarker(mutated);

  return { mutated, groundTruthId, class: 'M1', brokenSelector: `#${oldId}` };
}
