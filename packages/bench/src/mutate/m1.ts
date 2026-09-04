import { clone, pickTarget, markTarget, findMarkedFingerprint, stripMarker } from './helpers.js';
import type { MutationResult } from './types.js';

/** M1 — rename `data-testid` or `id` (PRD §9, repairable). */
export function mutateM1(snapshot: unknown, seed: number): MutationResult {
  const mutated = clone(snapshot);
  const target = pickTarget(mutated, seed);
  if (!target) throw new Error('mutateM1: no plausible target element found in this snapshot');

  const attrs = target[1] as Record<string, string>;
  // pickTarget no longer guarantees an id (it falls back to class/text targets for
  // idiom fixtures like utility-css that never have one — D-022). M1's whole
  // premise is renaming an id, so a target without one genuinely doesn't support
  // this class; the engine's same-class-then-other-class retry (D-021) then falls
  // through to a class that does apply.
  if (!attrs.id) throw new Error('mutateM1: chosen target has no id attribute to rename');
  const oldId = attrs.id;
  markTarget(target);
  attrs.id = `${oldId}-renamed-${seed}`;

  const groundTruthId = findMarkedFingerprint(mutated);
  stripMarker(mutated);

  return { mutated, groundTruthId, class: 'M1', brokenSelector: `#${oldId}` };
}
